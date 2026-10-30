package server

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/coder/websocket"
)

// allowedTelnetHost is the only upstream the local telnet bridge will dial.
//
// Hardcoded on purpose: the helper's WebSocket server is reachable by any web
// page the user has open (it accepts every origin), so an unrestricted TCP
// bridge would be an open relay / SSRF pivot into the user's own machine and
// network. Locking it to Arkadia keeps the bridge useful without that risk.
//
// It is a var rather than a const only so tests can point it at a local echo
// server; nothing at runtime mutates it.
var allowedTelnetHost = "arkadia.rpg.pl"

const (
	telnetDialTimeout = 10 * time.Second
	telnetReadBuffer  = 32 * 1024
	telnetReadLimit   = 1 << 20 // 1 MiB cap on a single inbound WebSocket frame
)

// clipReason trims a WebSocket close reason to the spec's 123-byte budget.
func clipReason(reason string) string {
	const max = 120
	if len(reason) > max {
		return reason[:max]
	}
	return reason
}

// handleTelnet bridges a browser WebSocket to Arkadia's raw telnet port,
// pumping bytes in both directions as binary frames (no base64 — the web
// client's binary codec maps frame bytes 1:1 to the telnet stream). This lets
// the client reach the telnet port locally instead of via the public
// Cloudflare proxy, when the user points their proxy URL at the helper.
func (s *Server) handleTelnet(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	portStr := r.URL.Query().Get("port")
	if portStr == "" {
		portStr = "23"
	}

	if host != allowedTelnetHost {
		http.Error(w, "host not allowed", http.StatusForbidden)
		return
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		http.Error(w, "invalid port", http.StatusBadRequest)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("telnet websocket accept error: %v", err)
		return
	}
	conn.SetReadLimit(telnetReadLimit)

	// Count this bridge as activity so the helper's idle-exit timer doesn't
	// fire mid-session when no hotkey/control client happens to be connected.
	s.addTelnet()
	defer s.removeTelnet()

	addr := net.JoinHostPort(host, strconv.Itoa(port))
	tcp, err := net.DialTimeout("tcp", addr, telnetDialTimeout)
	if err != nil {
		log.Printf("telnet dial %s failed: %v", addr, err)
		conn.Close(websocket.StatusInternalError, clipReason(fmt.Sprintf("Proxy: connect to %s failed: %v", addr, err)))
		return
	}
	log.Printf("telnet bridge connected to %s", addr)
	defer tcp.Close()

	type closeInfo struct {
		code   websocket.StatusCode
		reason string
	}
	// Buffered for both pumps: once one side decides the close status the other
	// errors out and pushes its own (ignored) result without blocking.
	done := make(chan closeInfo, 2)

	// TCP -> WebSocket
	go func() {
		buf := make([]byte, telnetReadBuffer)
		for {
			n, rerr := tcp.Read(buf)
			if n > 0 {
				if werr := conn.Write(context.Background(), websocket.MessageBinary, buf[:n]); werr != nil {
					done <- closeInfo{websocket.StatusNormalClosure, ""}
					return
				}
			}
			if rerr != nil {
				if errors.Is(rerr, io.EOF) {
					done <- closeInfo{websocket.StatusNormalClosure, "TCP connection closed"}
				} else {
					done <- closeInfo{websocket.StatusInternalError, clipReason("Proxy: TCP read error: " + rerr.Error())}
				}
				return
			}
		}
	}()

	// WebSocket -> TCP
	go func() {
		for {
			_, data, rerr := conn.Read(context.Background())
			if rerr != nil {
				done <- closeInfo{websocket.StatusNormalClosure, ""}
				return
			}
			if _, werr := tcp.Write(data); werr != nil {
				done <- closeInfo{websocket.StatusInternalError, clipReason("Proxy: TCP write error: " + werr.Error())}
				return
			}
		}
	}()

	info := <-done
	// Tear down both halves; the surviving goroutine then errors out on its
	// next read/write and exits (its result lands in the buffered channel).
	tcp.Close()
	conn.Close(info.code, info.reason)
	log.Printf("telnet bridge to %s closed: %s", addr, info.reason)
}

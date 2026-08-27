// Command proxy is a resumable telnet<->WebSocket bridge for the Arkadia web client.
//
// The stateless proxy the client ships with today ties the game connection to the
// browser's WebSocket: when a phone freezes its backgrounded tab the socket dies and
// the character is dropped, and since Arkadia has no session restore the player must
// log in again. This one keeps the telnet connection here, so a frozen tab costs
// nothing but a replay when the player comes back.
//
// Deployment notes are in README.md; the short version is a systemd unit behind Caddy,
// because an HTTPS page can only dial wss://.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
)

var (
	addr        = flag.String("addr", "127.0.0.1:8080", "listen address (front this with a TLS terminator)")
	upstreamHost = flag.String("upstream-host", "arkadia.rpg.pl", "the only host the bridge will dial")
	upstreamPort = flag.Int("upstream-port", 23, "upstream telnet port")
	// Sized from a real session log rather than picked: a busy hour measured ~27 KB/min
	// of raw wire traffic — game text base64'd inside gmcp_msgs envelopes, plus the
	// char.vitals stream that never reaches a log — so a full 25-minute TTL costs about
	// 675 KB. 2 MB leaves room for a session busier than that measurement, because
	// overflowing drops the *oldest* output, which is the part a player who died while
	// away most wants to read. See test/web/replayVolume.test.ts.
	maxBuffer   = flag.Int("buffer", 2*1024*1024, "bytes of output held for a detached client")
	ttl         = flag.Duration("ttl", 25*time.Minute, "how long an unattended session is kept before the game connection is dropped")
	dialTimeout = flag.Duration("dial-timeout", 10*time.Second, "upstream connect timeout")
)

func main() {
	flag.Parse()

	manager := newManager(*maxBuffer, *ttl)

	go func() {
		for range time.Tick(30 * time.Second) {
			if n := manager.reap(time.Now()); n > 0 {
				log.Printf("reaped %d abandoned session(s)", n)
			}
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/attach", func(w http.ResponseWriter, r *http.Request) {
		handleAttach(w, r, manager)
	})
	// Beacon from a client that is going away for good — a closed tab or a navigation,
	// as opposed to the backgrounding this whole proxy exists to survive.
	mux.HandleFunc("/leaving", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.URL.Query().Get("session"))
		session := manager.get(id)
		if session == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		// Not closed outright: a reload fires the same beacon, and the page is back
		// within a second or two. The grace period is long enough to cover that and
		// short enough that a genuinely closed tab does not leave a character standing
		// in the world for the full TTL.
		if session.leaving() {
			manager.remove(id)
			log.Printf("session %s… client left; closed", short(id))
		} else {
			// A reload: the replacement page beat the beacon here.
			log.Printf("session %s… leaving ignored, a client is attached", short(id))
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":       true,
			"sessions": manager.count(),
		})
	})

	log.Printf("listening on %s, bridging to %s:%d (ttl %s)", *addr, *upstreamHost, *upstreamPort, *ttl)
	server := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
}

// wsClient adapts a WebSocket to the little the Session needs from it, and owns the
// choice of wire format.
//
// framed clients get [type][timestamp][payload] and can stamp replayed output with when
// it actually happened. Unframed is what the stock client speaks today: raw bytes, no
// headers, no control channel — enough to test session resume with real play before any
// client code changes.
type wsClient struct {
	conn   *websocket.Conn
	ctx    context.Context
	framed bool
}

func (c *wsClient) write(payload []byte) error {
	ctx, cancel := context.WithTimeout(c.ctx, 20*time.Second)
	defer cancel()
	return c.conn.Write(ctx, websocket.MessageBinary, payload)
}

func (c *wsClient) sendData(at time.Time, payload []byte) error {
	if !c.framed {
		return c.write(payload)
	}
	return c.write(encodeFrame(FrameData, at, payload))
}

func (c *wsClient) sendControl(payload []byte) error {
	if !c.framed {
		// A raw client would render this as game text. Silence is better.
		return nil
	}
	return c.write(encodeFrame(FrameControl, time.Now(), payload))
}

func (c *wsClient) notice(text string) error {
	if c.framed {
		// Framed clients get the same facts in the control payload.
		return nil
	}
	return c.write([]byte("\r\n" + text + "\r\n"))
}

func (c *wsClient) close(reason string) {
	// The close reason has a 123-byte budget on the wire.
	if len(reason) > 120 {
		reason = reason[:120]
	}
	_ = c.conn.Close(websocket.StatusNormalClosure, reason)
}

func handleAttach(w http.ResponseWriter, r *http.Request, manager *Manager) {
	id := strings.TrimSpace(r.URL.Query().Get("session"))
	// The id is what lets a returning player pick their character back up, so it is a
	// credential: anything that can guess one attaches to a logged-in character. The
	// client generates a high-entropy value; all this end does is refuse the obviously
	// unsafe ones.
	if len(id) < 20 || len(id) > 200 {
		http.Error(w, "session id must be 20-200 characters", http.StatusBadRequest)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// The client is served from a different origin than this bridge.
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("websocket accept failed: %v", err)
		return
	}
	// A busy room can outrun a slow phone; a MUD's output is small, so a generous cap
	// costs little and avoids tearing down sessions over transient backpressure.
	conn.SetReadLimit(1 << 20)

	ctx := r.Context()
	// Opt-in framing: the stock client sends no `v`, so it keeps getting raw bytes and
	// works against this proxy unchanged.
	client := &wsClient{
		conn:   conn,
		ctx:    context.Background(),
		framed: r.URL.Query().Get("v") == "1",
	}

	session := manager.get(id)
	resumed := session != nil
	if session == nil {
		upstream, err := dialUpstream()
		if err != nil {
			_ = conn.Close(websocket.StatusInternalError, fmt.Sprintf("connect failed: %v", err))
			return
		}
		session = newSession(id, upstream, *maxBuffer)
		manager.put(id, session)
		log.Printf("session %s… opened", short(id))
	} else {
		log.Printf("session %s… resumed", short(id))
	}

	session.attach(client, resumed)
	defer session.detach(client)

	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			// Expected whenever a tab is closed, backgrounded into oblivion, or loses
			// signal. The session deliberately stays alive.
			return
		}
		if typ == websocket.MessageText {
			// Tolerated, but the client sends binary.
			data = []byte(string(data))
		}
		if err := session.write(data); err != nil {
			session.finish(fmt.Sprintf("upstream write failed: %v", err))
			return
		}
	}
}

func dialUpstream() (net.Conn, error) {
	if *upstreamHost == "" {
		return nil, errors.New("no upstream host configured")
	}
	// Pinned to one host on purpose. This bridge is reachable by anyone who finds it,
	// so an arbitrary-destination TCP relay would be an open proxy and an SSRF pivot.
	address := net.JoinHostPort(*upstreamHost, fmt.Sprint(*upstreamPort))
	return net.DialTimeout("tcp", address, *dialTimeout)
}

// short trims a session id for logs, which must never carry the whole credential.
func short(id string) string {
	if len(id) <= 6 {
		return "??????"
	}
	return id[:6]
}

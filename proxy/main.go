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
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"
)

var (
	addr         = flag.String("addr", "127.0.0.1:8080", "listen address (front this with a TLS terminator)")
	upstreamHost = flag.String("upstream-host", "arkadia.rpg.pl", "the only host the bridge will dial")
	upstreamPort = flag.Int("upstream-port", 23, "upstream telnet port")
	// Sized from a real session log rather than picked: a busy hour measured ~27 KB/min
	// of raw wire traffic — game text base64'd inside gmcp_msgs envelopes, plus the
	// char.state stream that never reaches a log — so a full 35-minute TTL costs about
	// 950 KB. 2 MB leaves room for a session busier than that measurement, because
	// overflowing drops the *oldest* output, which is the part a player who died while
	// away most wants to read. See test/web/replayVolume.test.ts.
	maxBuffer = flag.Int("buffer", 2*1024*1024, "bytes of output held for a detached client")
	// Past Arkadia's own limit on purpose. Its inactivity timeout tops out at 30
	// minutes, so a session held slightly longer lets the game be the one to end it —
	// and the dead upstream lingers with its buffer, so a player returning at 33
	// minutes reads "zostajesz rozlaczony z powodu bezczynnosci" instead of guessing at
	// a bare login screen. Undercutting it would throw that explanation away.
	ttl         = flag.Duration("ttl", 35*time.Minute, "how long an unattended session is kept before the game connection is dropped")
	dialTimeout = flag.Duration("dial-timeout", 10*time.Second, "upstream connect timeout")
	// A client cannot speak MCCP through this proxy — one zlib stream for the life of the
	// connection means a mid-session attach inflates garbage — so this end is the zlib
	// peer instead, and the browser hop is compressed by permessage-deflate. See mccp.go.
	// The flag is here to take it back out if the game's implementation misbehaves.
	useMccp = flag.Bool("mccp", true, "negotiate MCCP2 with the game and hand the client plaintext")
	// An open socket is not proof of a reader: a frozen tab keeps its WebSocket while
	// the page behind it runs nothing. The client pings every 3s, so silence past this
	// means output should be buffered rather than written into a socket nobody drains.
	// Generous against a merely-throttled background tab, whose timers Chrome slows.
	clientSilence = flag.Duration("client-silence", 20*time.Second, "how long an attached client may go silent before its output is buffered")
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
		// In the body, not the query, for the same reason the socket's id is in a
		// handshake header: a credential in a URL ends up in logs. Capped because this
		// is unauthenticated and the id has a known, small size.
		body, err := io.ReadAll(io.LimitReader(r.Body, 256))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		id := strings.TrimSpace(string(body))
		// Logged rather than dropped in silence. Whether these beacons arrive at all has
		// been an open question — a browser that never sends one leaves a character
		// standing in the world until the TTL — and a handler that returns quietly on a
		// malformed body cannot tell "never sent" from "sent wrong".
		if len(id) < 20 {
			log.Printf("leaving: ignoring a %d-byte body from %s", len(body), r.UserAgent())
			w.WriteHeader(http.StatusNoContent)
			return
		}
		session := manager.get(id)
		if session == nil {
			log.Printf("session %s… leaving, but no such session", short(id))
			w.WriteHeader(http.StatusNoContent)
			return
		}
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
// it actually happened. Unframed is raw bytes, no headers, no control channel — what a
// client that did not ask for the subprotocol receives, which keeps the proxy testable
// by hand with `wscat`.
type wsClient struct {
	conn   *websocket.Conn
	ctx    context.Context
	framed bool
	// The client build, from the handshake, so "it broke for me" can be checked against
	// what that user was actually running rather than guessed at from the time.
	build string
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

func (c *wsClient) version() string { return c.build }

func (c *wsClient) heartbeats() bool {
	// Our client pings every three seconds; a raw one may sit silent for minutes.
	return c.framed
}

func (c *wsClient) close(reason string) {
	// The close reason has a 123-byte budget on the wire.
	if len(reason) > 120 {
		reason = reason[:120]
	}
	_ = c.conn.Close(websocket.StatusNormalClosure, reason)
}

func handleAttach(w http.ResponseWriter, r *http.Request, manager *Manager) {
	id := sessionFromSubprotocols(r)
	// The id is what lets a returning player pick their character back up, so it is a
	// credential: anything that can guess one attaches to a logged-in character. The
	// client generates a high-entropy value; all this end does is refuse the obviously
	// unsafe ones.
	if len(id) < 20 || len(id) > 200 {
		http.Error(w, "session id must be 20-200 characters", http.StatusBadRequest)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Selected back only when the client offered it, which is how it says it can
		// read framed output. A client offering just its id gets raw bytes.
		Subprotocols: []string{sessionSubprotocol},
		// The client is served from a different origin than this bridge.
		InsecureSkipVerify: true,
		// The browser hop's compression, and the reason declining MCCP costs the player
		// nothing. Context takeover keeps a 32 KB window across messages, which suits
		// repetitive MUD output, and that window belongs to the WebSocket — so a
		// resuming client starts a fresh one and replayed output decodes like anything
		// else. Browsers offer the extension by default; Safari does not implement it
		// and falls back to no compression rather than failing.
		CompressionMode: websocket.CompressionContextTakeover,
	})
	if err != nil {
		log.Printf("websocket accept failed: %v", err)
		return
	}
	// A busy room can outrun a slow phone; a MUD's output is small, so a generous cap
	// costs little and avoids tearing down sessions over transient backpressure.
	conn.SetReadLimit(1 << 20)

	ctx := r.Context()
	// Opt-in framing: a client that did not ask for the subprotocol — `wscat`, say —
	// keeps getting raw bytes and can still exercise the proxy by hand.
	client := &wsClient{
		conn:   conn,
		ctx:    context.Background(),
		framed: conn.Subprotocol() == sessionSubprotocol,
		build:  buildFromSubprotocols(r),
	}

	session := manager.get(id)
	resumed := session != nil
	if session == nil {
		upstream, err := dialUpstream(short(id))
		if err != nil {
			_ = conn.Close(websocket.StatusInternalError, fmt.Sprintf("connect failed: %v", err))
			return
		}
		session = newSession(id, upstream, *maxBuffer, *clientSilence)
		manager.put(id, session)
		log.Printf("session %s… opened", short(id))
	} else {
		log.Printf("session %s… resumed", short(id))
	}

	session.attach(client, resumed, offsetFromSubprotocols(r))

	// The game ended this session while nobody was attached — idled out, quit, server
	// restarted. attach() has just handed over everything it never got to show,
	// including the game's own parting words, which is the point of keeping a dead
	// session around at all. Now it is drained, so retire it: the player is back at a
	// login screen, but knowing why.
	if session.isClosed() {
		manager.remove(id)
		log.Printf("session %s… drained after upstream closed", short(id))
		client.close("upstream closed while you were away")
		return
	}

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

func dialUpstream(label string) (net.Conn, error) {
	if *upstreamHost == "" {
		return nil, errors.New("no upstream host configured")
	}
	// Pinned to one host on purpose. This bridge is reachable by anyone who finds it,
	// so an arbitrary-destination TCP relay would be an open proxy and an SSRF pivot.
	address := net.JoinHostPort(*upstreamHost, fmt.Sprint(*upstreamPort))
	conn, err := net.DialTimeout("tcp", address, *dialTimeout)
	if err != nil || !*useMccp {
		return conn, err
	}
	return newMccpConn(conn, func() {
		log.Printf("session %s… mccp active upstream", label)
	}), nil
}

// Handshake subprotocols. The versioned name says the client can read framed output;
// the prefixed one carries the session id.
const (
	sessionSubprotocol   = "arkadia-session-v1"
	sessionIDSubprotocol = "s."
	// Optional: which build the client is running, for tying a report to a deploy.
	buildSubprotocol = "b."
	// Optional: how many bytes of output the client has already processed, so a resume
	// hands back exactly what it missed and nothing it already has.
	offsetSubprotocol = "o."
)

/*
sessionFromSubprotocols pulls the session id out of the handshake.

It rides in `Sec-WebSocket-Protocol` rather than the query string because it is a
credential that attaches to a logged-in character, and a URL is written down everywhere
it goes: access logs, error pages, upstream proxies, a screenshot of a devtools panel.
Keeping it out of them by configuration — this deployment strips the URI from Caddy's log
— works right up until one hop is configured differently. A header nothing logs by
default removes the class of mistake instead of guarding against it.

A browser cannot set arbitrary headers on a WebSocket, but it can set this one, which is
what makes the approach available at all.
*/
func sessionFromSubprotocols(r *http.Request) string {
	return subprotocolValue(r, sessionIDSubprotocol)
}

// buildFromSubprotocols reads the client's build, if it offered one. Optional by design:
// an old client that does not send it still connects, it just shows as unknown.
func buildFromSubprotocols(r *http.Request) string {
	build := subprotocolValue(r, buildSubprotocol)
	if len(build) > 40 {
		build = build[:40]
	}
	return build
}

/*
offsetFromSubprotocols reads how far the client got, or -1 if it did not say.

Only the client can answer this. A write succeeding here proves the bytes reached a
kernel buffer, not a screen — the renderer that would have drawn them is the one part of
the chain that freezes, while every layer beneath it keeps accepting data. So the client
counts what it has actually processed and reports it on the way back in.
*/
func offsetFromSubprotocols(r *http.Request) int64 {
	raw := subprotocolValue(r, offsetSubprotocol)
	if raw == "" {
		return -1
	}
	offset, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || offset < 0 {
		return -1
	}
	return offset
}

func subprotocolValue(r *http.Request, prefix string) string {
	for _, header := range r.Header.Values("Sec-WebSocket-Protocol") {
		for _, entry := range strings.Split(header, ",") {
			entry = strings.TrimSpace(entry)
			if value, ok := strings.CutPrefix(entry, prefix); ok {
				return value
			}
		}
	}
	return ""
}

// short trims a session id for logs, which must never carry the whole credential.
func short(id string) string {
	if len(id) <= 6 {
		return "??????"
	}
	return id[:6]
}

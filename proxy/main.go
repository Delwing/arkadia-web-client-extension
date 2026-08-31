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
	// Where unclaimed sessions go once their buffer outlives memory, and for how long.
	// Empty disables it: this puts gameplay on disk, which is a deliberate choice.
	archiveDir = flag.String("archive-dir", "", "directory for unclaimed session buffers; empty disables archiving")
	archiveTTL = flag.Duration("archive-ttl", 7*24*time.Hour, "how long an unclaimed archive is kept")
	// Long enough for one more client ping (they arrive every 3s), so a clean logout
	// ends with its last messages confirmed rather than held as still-owed.
	closeGrace    = flag.Duration("close-grace", 4*time.Second, "how long a closed session waits for a final acknowledgement before hanging up")
	clientSilence = flag.Duration("client-silence", 20*time.Second, "how long an attached client may go silent before its output is buffered")
)

func main() {
	flag.Parse()

	manager := newManager(*maxBuffer, *ttl)

	archive, err := newArchiveStore(*archiveDir, *archiveTTL)
	if err != nil {
		log.Fatalf("archive: %v", err)
	}
	if archive.enabled() {
		log.Printf("archiving unclaimed sessions to %s for %s (%d held)",
			*archiveDir, *archiveTTL, archive.count())
	}

	go func() {
		lastPrune := time.Now()
		for range time.Tick(30 * time.Second) {
			expired, stale := manager.reap(time.Now())
			if expired > 0 {
				log.Printf("reaped %d abandoned session(s)", expired)
			}
			// Out of memory, not out of reach: a player who forgets they were playing
			// and comes back hours later still gets what they missed.
			for _, s := range stale {
				if record := s.session.archivable(); record != nil {
					if err := archive.save(s.id, record); err != nil {
						log.Printf("session %s… archive failed: %v", short(s.id), err)
					} else {
						log.Printf("session %s… archived %d chunk(s)", short(s.id), len(record.Chunks))
					}
				}
			}
			if time.Since(lastPrune) > time.Hour {
				lastPrune = time.Now()
				if n := archive.prune(time.Now()); n > 0 {
					log.Printf("pruned %d archive(s) past %s", n, *archiveTTL)
				}
			}
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/attach", func(w http.ResponseWriter, r *http.Request) {
		handleAttach(w, r, manager, archive)
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
			// A reload: the replacement page beat the beacon here, and stayed attached
			// for the grace leaving() waits out.
			log.Printf("session %s… leaving ignored, a client is attached", short(id))
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":       true,
			"sessions": manager.count(),
			"archived": archive.count(),
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

func handleAttach(w http.ResponseWriter, r *http.Request, manager *Manager, archive *archiveStore) {
	id := sessionFromSubprotocols(r)
	// The id is what lets a returning player pick their character back up, so it is a
	// credential: anything that can guess one attaches to a logged-in character. The
	// client generates a high-entropy value; all this end does is refuse the obviously
	// unsafe ones.
	if len(id) < 20 || len(id) > 200 {
		http.Error(w, "session id must be 20-200 characters", http.StatusBadRequest)
		return
	}

	// The browser hop's compression, and the reason declining MCCP costs the player
	// nothing. Context takeover keeps a 32 KB window across messages, which suits
	// repetitive MUD output, and that window belongs to the WebSocket — so a
	// resuming client starts a fresh one and replayed output decodes like anything
	// else. Declined for WebKit's socket stack, whose deflate is broken — see
	// webkitSocket.
	compression := websocket.CompressionContextTakeover
	if webkitSocket(r.UserAgent()) {
		compression = websocket.CompressionDisabled
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Selected back only when the client offered it, which is how it says it can
		// read framed output. A client offering just its id gets raw bytes.
		Subprotocols: []string{sessionSubprotocol},
		// The client is served from a different origin than this bridge.
		InsecureSkipVerify: true,
		CompressionMode:    compression,
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
		/*
			Nothing live under that id, but there may be something owed.

			A player who forgot they were playing comes back to a session the game ended
			hours ago. Opening a fresh connection first would bury what they missed under
			a login banner, so the archive is handed over on its own and the socket
			closed: they are told when and why it ended, read the rest, and log in when
			they choose to.
		*/
		if record := archive.load(id); record != nil {
			serveArchive(client, record, offsetFromSubprotocols(r))
			archive.remove(id)
			log.Printf("session %s… archive claimed after %s",
				short(id), time.Since(record.ClosedAt).Round(time.Minute))
			return
		}

		upstream, err := dialUpstream(short(id))
		if err != nil {
			_ = conn.Close(websocket.StatusInternalError, fmt.Sprintf("connect failed: %v", err))
			return
		}
		session = newSession(id, upstream, *maxBuffer, *clientSilence, *closeGrace)
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

/*
webkitSocket reports whether the request comes from WebKit's WebSocket stack — desktop
Safari, or any browser on iOS, since Apple's platform rule puts them all on WebKit.

Compression must not be negotiated with it. Since Safari 15 that stack (NSURLSession)
offers permessage-deflate, but the implementation is broken in documented ways — context
takeover is mishandled, and compressed messages split across frames kill the connection.
The observed result inverted this proxy's entire purpose: an iPhone connected, dropped
within moments, resumed, and dropped again on the next message — and the very first drop
tended to land between the game's IAC WILL GMCP and the client's answer, leaving the
session without GMCP for good. Chrome and Firefox negotiate the same extension correctly
and keep it.

MUD output is small — a busy hour measures ~27 KB/min — so an uncompressed browser hop
for these clients costs effectively nothing.
*/
func webkitSocket(ua string) bool {
	// iOS browsers do not say "Chrome" or "Firefox": they are "CriOS", "FxiOS" and
	// "EdgiOS", all wrapping WebKit. "EdgiOS" must be caught here, before the
	// desktop-engine exclusions below would misread its "Edg" prefix as Chromium.
	for _, token := range []string{"iPhone", "iPad", "iPod", "CriOS", "FxiOS", "EdgiOS"} {
		if strings.Contains(ua, token) {
			return true
		}
	}
	// Desktop Safari. Every Chromium-based browser also says "Safari", so the name
	// only counts when no other engine is named. An iPad in its default desktop mode
	// lands here too: its user agent masquerades as macOS Safari.
	if !strings.Contains(ua, "Safari") {
		return false
	}
	for _, token := range []string{"Chrome", "Chromium", "Edg", "Android"} {
		if strings.Contains(ua, token) {
			return false
		}
	}
	return true
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

/*
serveArchive hands a returning player what an ended session left them, and nothing else.

Deliberately not followed by a fresh game connection. The value here is the explanation —
when the session ended and what the game said as it went — and a login banner scrolling in
on top of it would bury exactly the thing they came back for. The control frame carries
`upstreamClosed`, which is what stops the client reattaching over it.

The client's own offset is honoured, so anything it managed to read before its socket died
is not shown twice.
*/
func serveArchive(client *wsClient, record *archivedSession, clientOffset int64) {
	replayed := 0
	control, _ := json.Marshal(controlPayload{
		Type:           "archived",
		SessionAgeMs:   record.ClosedAt.Sub(record.CreatedAt).Milliseconds(),
		DetachedForMs:  time.Since(record.ClosedAt).Milliseconds(),
		DroppedBytes:   record.DroppedBytes,
		Resumed:        true,
		UpstreamClosed: true,
		CloseReason:    record.CloseReason,
	})
	_ = client.sendControl(control)
	_ = client.notice(fmt.Sprintf("[proxy] sesja zakonczona %s temu: %s",
		time.Since(record.ClosedAt).Round(time.Minute), record.CloseReason))

	for _, c := range record.Chunks {
		end := c.offset + int64(len(c.bytes))
		if clientOffset >= 0 && end <= clientOffset {
			continue // already on their screen before the socket went
		}
		payload := c.bytes
		if clientOffset > c.offset && clientOffset < end {
			payload = payload[clientOffset-c.offset:]
		}
		if err := client.sendData(c.at, payload); err != nil {
			return
		}
		replayed += len(payload)
	}
	client.close("archived session replayed")
}

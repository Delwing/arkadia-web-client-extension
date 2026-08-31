package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"sync"
	"time"
)

const (
	// How long a leaving notice waits for a client that is on its way out. Long enough
	// to cover a socket close crossing the network and this end noticing it, short
	// enough that a beacon from a reload — where the replacement client stays put — is
	// answered promptly rather than held. See Session.leaving.
	detachGrace = 500 * time.Millisecond
	detachPoll  = 10 * time.Millisecond
)

// A chunk of game output and when the proxy received it.
type chunk struct {
	at    time.Time
	bytes []byte
	// Where this chunk starts in the session's output stream, counted from the first
	// byte the session ever produced. It is what lets a returning client say exactly
	// how far it got: see acknowledged.
	offset int64
}

// controlPayload is the JSON inside a FrameControl frame, sent on every attach so the
// client knows what it just received and whether anything was lost.
type controlPayload struct {
	Type          string `json:"type"`
	SessionAgeMs  int64  `json:"sessionAgeMs"`
	DetachedForMs int64  `json:"detachedForMs"`
	ReplayedBytes int    `json:"replayedBytes"`
	DroppedBytes  int    `json:"droppedBytes"`
	Resumed       bool   `json:"resumed"`
	// The game ended the connection while nobody was attached — an idle timeout, a
	// quit, a server restart. Distinct from the proxy losing the session, and the
	// difference is the whole answer to "what happened while I was away".
	UpstreamClosed bool   `json:"upstreamClosed,omitempty"`
	CloseReason    string `json:"closeReason,omitempty"`
}

// Session owns one telnet connection to the game and, at most, one attached client.
//
// The point of the whole thing: the telnet connection outlives the client. A phone that
// freezes its browser tab loses the WebSocket, not the character — output accumulates
// here and is replayed when the player comes back.
type Session struct {
	id      string
	created time.Time

	mu         sync.Mutex
	upstream   net.Conn
	client     clientConn
	detachedAt time.Time
	// Output held for a client that is not currently attached, oldest first.
	pending      []chunk
	pendingBytes int
	droppedBytes int
	closed       bool
	// When the game connection ended. The retention clock for a closed session that
	// still holds output: detachedAt cannot serve, since a frozen tab is still
	// "attached" at the moment the game hangs up.
	closedAt    time.Time
	closeReason string

	// When the current client attached and when it last said anything. Both feed
	// clientStale, the only thing standing between a frozen tab and output written into
	// a socket nobody reads.
	attachedAt time.Time
	lastClient time.Time

	// Whether the attached client pings, and how long its silence may run before its
	// output is buffered rather than written into a socket nobody is reading.
	clientHeartbeats bool
	silenceLimit     time.Duration
	// How long a closed session keeps its socket open so a last ping can confirm what
	// was just sent. Zero closes at once.
	closeGrace time.Duration
	// Build the attached client reports at handshake, so a bug report can be tied to a
	// deploy rather than guessed at.
	clientVersion string

	/*
		Written to the client, but not yet known to have arrived.

		A socket accepting a write proves nothing: the bytes may sit in a kernel buffer
		belonging to a tab that never wakes to read them. That is how a line went missing
		— written 13 seconds after the client's last ping, while it still counted as
		live, into a socket that was already gone.

		So writes are held here until the client proves it was alive after them, and a
		client that reattaches gets back whatever it never confirmed. It says how far it
		actually got, so nothing is replayed twice; without that we would have to choose
		between duplicates and loss.
	*/
	unconfirmed      []chunk
	unconfirmedBytes int
	// Total bytes of game output this session has ever produced, and the offset the
	// attached client has been written up to.
	produced    int64
	deliveredTo int64

	maxBuffer int
}

// clientConn is the little a Session needs from a WebSocket, kept as an interface so
// the buffering and replay logic can be tested without a network.
//
// The wire format lives behind it rather than in the Session, because a client may ask
// for either: the framed protocol that carries arrival times, or raw bytes for the
// stock client that predates it.
type clientConn interface {
	// sendData delivers game output that arrived at the given time.
	sendData(at time.Time, payload []byte) error
	// sendControl delivers session metadata, and does nothing for a raw client that
	// would render it as game text.
	sendControl(payload []byte) error
	// notice delivers a human-readable line into the game stream. Only a raw client
	// uses it — a framed one gets the same facts in the control payload.
	notice(text string) error
	// heartbeats reports whether this client pings on its own, which is what makes
	// its silence meaningful. See clientStale.
	heartbeats() bool
	// version is the build the client reports at handshake, or "" if it did not say.
	version() string
	close(reason string)
}

func newSession(id string, upstream net.Conn, maxBuffer int, silenceLimit, closeGrace time.Duration) *Session {
	s := &Session{
		id:           id,
		created:      time.Now(),
		upstream:     upstream,
		maxBuffer:    maxBuffer,
		silenceLimit: silenceLimit,
		closeGrace:   closeGrace,
	}
	s.detachedAt = s.created
	go s.pump()
	return s
}

// pump reads the game forever, handing output to the client or parking it.
func (s *Session) pump() {
	buf := make([]byte, 32*1024)
	for {
		n, err := s.upstream.Read(buf)
		if n > 0 {
			// Copy: buf is reused on the next read, and the bytes may sit in the
			// pending queue long after this iteration.
			out := make([]byte, n)
			copy(out, buf[:n])
			s.deliver(chunk{at: time.Now(), bytes: out})
		}
		if err != nil {
			reason := "upstream closed the connection"
			if !errors.Is(err, io.EOF) {
				reason = fmt.Sprintf("upstream read error: %v", err)
			}
			s.finish(reason)
			return
		}
	}
}

/*
clientStale reports that the attached client has stopped listening, whatever its socket
says.

An open socket is not proof of a reader. When a phone freezes a tab, the WebSocket is
held by the browser's network stack, not the frozen page — so the connection stays up,
writes keep succeeding into a kernel buffer nobody drains, and the output is gone. That
defeats the entire point of this proxy, and it is invisible from here unless something
else is watched.

The client's own ping is that something: it is generated by JavaScript in the page, so it
stops the moment the page does. Silence well past its interval means the bytes we are
about to write would be written into the void, and belong in the buffer instead.

Only for clients that ping. A `wscat` session testing this by hand sends nothing for
minutes at a time and is perfectly awake.
*/
func (s *Session) clientStale(now time.Time) bool {
	if !s.clientHeartbeats {
		return false
	}
	since := s.lastClient
	if since.IsZero() {
		// Nothing heard yet — measure from the attach, since the first ping follows
		// within a few seconds of one.
		since = s.attachedAt
	}
	return !since.IsZero() && now.Sub(since) > s.silenceLimit
}

func (s *Session) deliver(c chunk) {
	s.mu.Lock()
	defer s.mu.Unlock()

	c.offset = s.produced
	s.produced += int64(len(c.bytes))

	if s.client != nil && !s.clientStale(c.at) {
		if err := s.client.sendData(c.at, c.bytes); err == nil {
			// Written, not confirmed. Held until the client proves it was still alive
			// afterwards, so a socket that dies unnoticed costs nothing.
			s.deliveredTo = s.produced
			s.unconfirmed = append(s.unconfirmed, c)
			s.unconfirmedBytes += len(c.bytes)
			s.trimUnconfirmedLocked()
			return
		}
		// The send failed but no close has reached us yet. Treat the client as gone
		// and park the bytes rather than dropping them on the floor.
		s.client = nil
		s.detachedAt = time.Now()
	}

	s.appendPendingLocked(c)
}

/*
confirmedLocked records that the client was alive just now, so everything written to it
before this moment can be let go.

Its ping is the proof: generated by JavaScript in the page, so it cannot arrive from a
tab that is not running. Anything written after it stays held.
*/
func (s *Session) confirmedLocked() {
	s.unconfirmed = nil
	s.unconfirmedBytes = 0
}

// trimUnconfirmedLocked keeps the held window inside its budget. Dropping the oldest is
// safe: those are the writes most likely to have actually landed.
func (s *Session) trimUnconfirmedLocked() {
	for s.unconfirmedBytes > s.maxBuffer && len(s.unconfirmed) > 0 {
		s.unconfirmedBytes -= len(s.unconfirmed[0].bytes)
		s.unconfirmed = s.unconfirmed[1:]
	}
}

/*
missedSince returns everything from the given offset that the client has not confirmed,
oldest first, along with how much was lost to the buffer's limit.

A returning client says how far it actually got; anything it names as received is
dropped, so a replay never repeats what is already on screen.
*/
func (s *Session) missedSinceLocked(from int64) ([]chunk, int) {
	all := append(append([]chunk{}, s.unconfirmed...), s.pending...)
	out := make([]chunk, 0, len(all))
	dropped := 0
	for _, c := range all {
		end := c.offset + int64(len(c.bytes))
		if end <= from {
			continue // already on their screen
		}
		if c.offset < from {
			// Partially seen: hand back only the tail they are missing.
			cut := int(from - c.offset)
			out = append(out, chunk{at: c.at, bytes: c.bytes[cut:], offset: from})
			continue
		}
		out = append(out, c)
	}
	if len(out) > 0 && out[0].offset > from {
		dropped = int(out[0].offset - from)
	}
	return out, dropped
}

// appendPendingLocked parks a chunk for an absent client, dropping the oldest to stay
// inside the buffer. The caller holds the lock.
func (s *Session) appendPendingLocked(c chunk) {
	s.pending = append(s.pending, c)
	s.pendingBytes += len(c.bytes)
	for s.pendingBytes > s.maxBuffer && len(s.pending) > 0 {
		oldest := s.pending[0]
		s.pending = s.pending[1:]
		s.pendingBytes -= len(oldest.bytes)
		s.droppedBytes += len(oldest.bytes)
	}
}

/*
flushPendingLocked hands the buffer to the attached client, in arrival order.

Used when a tab wakes on a socket that never died: it missed everything written while it
was frozen, and the buffer is exactly that. The caller holds the lock.
*/
func (s *Session) flushPendingLocked() {
	pending := s.pending
	s.pending = nil
	s.pendingBytes = 0
	for i, ch := range pending {
		if err := s.client.sendData(ch.at, ch.bytes); err != nil {
			s.client = nil
			s.detachedAt = time.Now()
			// Put back everything from here on, so a later attach still has it.
			s.pending = append(s.pending, pending[i:]...)
			for _, missed := range pending[i:] {
				s.pendingBytes += len(missed.bytes)
			}
			return
		}
		/*
			Written, and therefore no safer than any other write: the ping that triggered
			this flush proves the page was running a moment ago, not that it has read what
			we are handing it now. Leaving these out of the held window — as this did —
			meant a tab that woke, took the buffer and died again lost exactly the output
			it had just been given, with nothing left to replay from.
		*/
		s.unconfirmed = append(s.unconfirmed, ch)
		s.unconfirmedBytes += len(ch.bytes)
		if end := ch.offset + int64(len(ch.bytes)); end > s.deliveredTo {
			s.deliveredTo = end
		}
	}
	s.trimUnconfirmedLocked()
}

// attach hands the session to a client, replacing any previous one, and replays
// whatever accumulated while nobody was listening.
func (s *Session) attach(c clientConn, resumed bool, clientOffset int64) {
	s.mu.Lock()
	previous := s.client
	s.client = c
	s.detachedAt = time.Time{}
	s.attachedAt = time.Now()
	s.clientHeartbeats = c.heartbeats()
	s.clientVersion = c.version()

	/*
		Where to resume from.

		The client's own count wins, because it is the only party that knows what it
		actually processed — the proxy knows only what it handed to a socket, which is
		exactly the thing that turned out not to be the same. A client that does not
		report one gets everything still held, which risks repeating a line rather than
		losing one.
	*/
	from := clientOffset
	if from < 0 {
		// No cursor to work from, so hand back everything still held and let the
		// overflow counter speak for what the buffer had to discard.
		switch {
		case len(s.unconfirmed) > 0:
			from = s.unconfirmed[0].offset
		case len(s.pending) > 0:
			from = s.pending[0].offset
		default:
			from = s.deliveredTo
		}
	}

	pending, missedGap := s.missedSinceLocked(from)
	replayed := 0
	for _, ch := range pending {
		replayed += len(ch.bytes)
	}
	// A client that named its own position gets the exact gap between there and the
	// oldest byte still held; one that did not gets the overflow counter, which is the
	// only measure of loss available without a cursor. Never both: they describe the
	// same discarded bytes from two directions.
	dropped := s.droppedBytes
	if clientOffset >= 0 {
		dropped = missedGap
	}
	s.pending = nil
	s.pendingBytes = 0
	s.droppedBytes = 0
	s.unconfirmed = nil
	s.unconfirmedBytes = 0
	s.deliveredTo = s.produced
	age := time.Since(s.created)
	upstreamClosed := s.closed
	closeReason := s.closeReason
	s.mu.Unlock()

	if previous != nil {
		// Two live clients on one character would interleave input unpredictably.
		previous.close("replaced by a newer attach")
	}

	control, _ := json.Marshal(controlPayload{
		Type:           "attached",
		SessionAgeMs:   age.Milliseconds(),
		ReplayedBytes:  replayed,
		DroppedBytes:   dropped,
		Resumed:        resumed,
		UpstreamClosed: upstreamClosed,
		CloseReason:    closeReason,
	})
	_ = c.sendControl(control)

	// A raw client cannot read the control payload, so tell it in the only language it
	// has. Worth the intrusion: without it there is no way to tell a resumed session
	// from a fresh one, which is the entire thing being tested.
	if resumed && !upstreamClosed {
		text := "[proxy] wznowiono sesje"
		if dropped > 0 {
			text = fmt.Sprintf("%s (utracono %d bajtow starszych danych)", text, dropped)
		}
		_ = c.notice(text)
	}
	if upstreamClosed {
		_ = c.notice(fmt.Sprintf("[proxy] gra zamknela polaczenie: %s", closeReason))
	}

	// Each chunk keeps the time it actually arrived, which is the whole reason the
	// stream is framed.
	for _, ch := range pending {
		if err := c.sendData(ch.at, ch.bytes); err != nil {
			return
		}
	}
}

func (s *Session) detach(c clientConn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.client == c {
		s.client = nil
		s.detachedAt = time.Now()
	}
}

// write forwards player input to the game.
func (s *Session) write(b []byte) error {
	s.mu.Lock()
	up := s.upstream
	closed := s.closed
	// The client pings every three seconds, so this doubles as a heartbeat: a gap much
	// longer than that, while still attached, means the tab is frozen or throttled and
	// its socket simply has not noticed yet.
	wasStale := s.clientStale(time.Now())
	s.lastClient = time.Now()
	// It is awake again, and on the same socket it went to sleep on. Hand over what it
	// missed rather than making it reconnect to find out.
	if s.client != nil && !wasStale {
		// Proof the page is running: everything written before now has been read.
		s.confirmedLocked()
	}
	if wasStale && s.client != nil && len(s.pending) > 0 {
		s.flushPendingLocked()
	}
	s.mu.Unlock()
	if closed || up == nil {
		return errors.New("session is closed")
	}
	_, err := up.Write(b)
	return err
}

// idleFor reports how long nobody has been attached; zero while a client is present.
func (s *Session) idleFor(now time.Time) time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.client != nil || s.detachedAt.IsZero() {
		return 0
	}
	return now.Sub(s.detachedAt)
}

/*
leaving ends the session because its client is going away deliberately — a closed tab, a
navigation, or the player pressing disconnect — rather than the backgrounding this proxy
exists to survive.

Ignored while a client is attached, which is what makes a reload safe. The beacon is
sent as the old page unloads but delivered by the browser afterwards, so the replacement
page can attach first; acting on it then would kill the session that page is already
using. Somebody being attached means the notice is stale, whoever sent it.

The wait is for the other order. A player disconnecting from the menu is not unloading
anything, so its notice is an ordinary request racing its own socket's close: the client
sends it once that socket is gone, but "gone" is decided at two ends, and this one can
still be inside the read loop that will detach a moment later. Refusing outright then
leaves the character standing in the world for the whole TTL — the exact outcome the
notice exists to prevent — over a few milliseconds of scheduling. A reload is unaffected:
the page that replaced it stays attached, so the wait simply expires.
*/
func (s *Session) leaving() bool {
	if !s.awaitDetach(detachGrace) {
		return false
	}
	s.finish("client left")
	return true
}

// awaitDetach reports whether the session has no attached client, waiting up to d for
// one on its way out. Polled rather than signalled: this runs once per departure, and a
// condition variable would put coordination into every attach and detach to serve it.
func (s *Session) awaitDetach(d time.Duration) bool {
	deadline := time.Now().Add(d)
	for {
		s.mu.Lock()
		attached := s.client != nil
		s.mu.Unlock()
		if !attached {
			return true
		}
		if !time.Now().Before(deadline) {
			return false
		}
		time.Sleep(detachPoll)
	}
}

// finish tears the session down: the game is gone, so the client should know.
func (s *Session) finish(reason string) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	s.closedAt = time.Now()
	s.closeReason = reason
	client := s.client
	heartbeats := s.clientHeartbeats
	if s.upstream != nil {
		_ = s.upstream.Close()
	}
	/*
		The client stays attached through the grace below, so its next ping can still
		confirm the last thing it was sent.

		Without that, a clean logout always ends with its final messages unconfirmed —
		the acknowledgement would have ridden on a ping that never comes, because the
		socket is already gone. The session is then held as still-owed for its full
		retention, and archived, for output the player demonstrably read.
	*/
	waiting := client != nil && heartbeats && s.closeGrace > 0
	if !waiting {
		s.client = nil
	}
	s.mu.Unlock()

	if client != nil {
		/*
			Say who ended it before hanging up.

			A closed socket on its own is ambiguous, and the client's two responses are
			opposite: a socket lost while the game connection lives should be reattached
			silently, while a game that has ended the session must not be — reattaching
			opens a fresh connection and drops the player at a login screen they did not
			ask for. That is exactly what "zakoncz" produced.

			The same facts reach a client that attaches later, in attach()'s control
			payload. This is the path for one that is already here.
		*/
		control, _ := json.Marshal(controlPayload{
			Type:           "ended",
			UpstreamClosed: true,
			CloseReason:    reason,
		})
		_ = client.sendControl(control)
		_ = client.notice(fmt.Sprintf("[proxy] gra zamknela polaczenie: %s", reason))

		if !waiting {
			client.close(reason)
			return
		}
		// Held open just long enough for one more ping — the client sends them every
		// three seconds, so this is a short wait for a definite answer rather than a
		// guess either way.
		go func() {
			time.Sleep(s.closeGrace)
			s.mu.Lock()
			if s.client == client {
				s.client = nil
			}
			s.mu.Unlock()
			client.close(reason)
		}()
	}
}

func (s *Session) isClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
}

// hasUnreadOutput reports whether anything is still waiting for a client to collect it.
func (s *Session) hasUnreadOutput() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Unconfirmed counts as unread, and has to: it was written into a socket that
	// accepted it, which is no evidence anybody read it — that is the whole reason it is
	// kept. A closed session holding only unconfirmed writes still owes the player
	// something, and reaping it would throw away exactly the bytes a frozen tab missed.
	return len(s.pending) > 0 || len(s.unconfirmed) > 0
}

// Manager keeps sessions addressable by id and reaps abandoned ones.
type Manager struct {
	mu        sync.Mutex
	sessions  map[string]*Session
	maxBuffer int
	ttl       time.Duration
}

func newManager(maxBuffer int, ttl time.Duration) *Manager {
	return &Manager{
		sessions:  make(map[string]*Session),
		maxBuffer: maxBuffer,
		ttl:       ttl,
	}
}

/*
get returns the session for an id, or nil.

A session whose upstream has closed is still handed back while it holds output nobody
has read. That is the difference between coming back to "you were idled out, here is the
game saying so" and coming back to a bare login screen with no idea whether you quit
safely or the proxy dropped you. Once drained it is gone, and the next attach opens a
fresh connection.
*/
func (m *Manager) get(id string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.sessions[id]
	if s != nil && s.isClosed() && !s.hasUnreadOutput() {
		delete(m.sessions, id)
		return nil
	}
	return s
}

func (m *Manager) put(id string, s *Session) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[id] = s
}

func (m *Manager) remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, id)
}

func (m *Manager) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sessions)
}

// reap closes sessions nobody has come back to. Without it an abandoned character
// stays logged in indefinitely, which is both a resource leak and a gameplay problem.
/*
reap ends sessions nobody has come back to.

Returns those whose unread output outlived its welcome in memory, so the caller can put
them on disk: without that an abandoned character stays logged in indefinitely, and with
only that a player who forgets they were playing loses the explanation entirely.
*/
func (m *Manager) reap(now time.Time) (expiredCount int, stale []staleSession) {
	m.mu.Lock()
	var expired []staleSession
	for id, s := range m.sessions {
		/*
			A closed session is kept while it still holds output nobody has read. That is
			the whole reason the TTL sits past Arkadia's own idle limit: the game's
			parting words are in that buffer, and a player who comes back to a bare login
			screen cannot tell an idle-out from the proxy having lost them. Discarding it
			on the next 30-second tick, as this did, threw that away before almost anyone
			could collect it.

			On its own clock, not idleFor's. A frozen tab keeps its socket, so the client
			can still be "attached" when the game closes — detachedAt is never set, and
			idleFor would answer zero forever.
		*/
		if s.isClosed() {
			if !s.hasUnreadOutput() {
				delete(m.sessions, id)
			} else if s.closedFor(now) > m.ttl {
				// Out of time in memory, but still owed. Handed to the caller to put on
				// disk, where it stays claimable for far longer than a session can be.
				stale = append(stale, staleSession{id: id, session: s})
				delete(m.sessions, id)
			}
			continue
		}
		if s.idleFor(now) > m.ttl {
			expired = append(expired, staleSession{id: id, session: s})
			delete(m.sessions, id)
		}
	}
	m.mu.Unlock()

	for _, s := range expired {
		s.session.finish("session abandoned for longer than the TTL")
		// Nobody came back for it, which is exactly the case the archive is for: the
		// buffer holds output the player never saw, and dropping it here would throw
		// away the only copy.
		stale = append(stale, s)
	}
	return len(expired), stale
}

// staleSession is a closed session whose buffer is being moved out of memory.
type staleSession struct {
	id      string
	session *Session
}

/*
archivable describes everything a player is still owed, for storing past the TTL.

Unconfirmed writes come first and count as owed: a socket accepting them is no evidence
anybody read them, which is the whole reason they are kept.
*/
func (s *Session) archivable() *archivedSession {
	s.mu.Lock()
	defer s.mu.Unlock()

	chunks := append(append([]chunk{}, s.unconfirmed...), s.pending...)
	if len(chunks) == 0 {
		return nil
	}
	return &archivedSession{
		archiveRecord: archiveRecord{
			CreatedAt:    s.created,
			ClosedAt:     s.closedAt,
			CloseReason:  s.closeReason,
			DroppedBytes: s.droppedBytes,
			Produced:     s.produced,
		},
		Chunks: chunks,
	}
}

// closedFor reports how long ago the game connection ended; zero while it is open.
func (s *Session) closedFor(now time.Time) time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.closed || s.closedAt.IsZero() {
		return 0
	}
	return now.Sub(s.closedAt)
}

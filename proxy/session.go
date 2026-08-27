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

// A chunk of game output and when the proxy received it.
type chunk struct {
	at    time.Time
	bytes []byte
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
	closeReason  string

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
	close(reason string)
}

func newSession(id string, upstream net.Conn, maxBuffer int) *Session {
	s := &Session{
		id:        id,
		created:   time.Now(),
		upstream:  upstream,
		maxBuffer: maxBuffer,
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

func (s *Session) deliver(c chunk) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.client != nil {
		if err := s.client.sendData(c.at, c.bytes); err == nil {
			return
		}
		// The send failed but no close has reached us yet. Treat the client as gone
		// and park the bytes rather than dropping them on the floor.
		s.client = nil
		s.detachedAt = time.Now()
	}

	s.pending = append(s.pending, c)
	s.pendingBytes += len(c.bytes)
	for s.pendingBytes > s.maxBuffer && len(s.pending) > 0 {
		oldest := s.pending[0]
		s.pending = s.pending[1:]
		s.pendingBytes -= len(oldest.bytes)
		s.droppedBytes += len(oldest.bytes)
	}
}

// attach hands the session to a client, replacing any previous one, and replays
// whatever accumulated while nobody was listening.
func (s *Session) attach(c clientConn, resumed bool) {
	s.mu.Lock()
	previous := s.client
	s.client = c
	s.detachedAt = time.Time{}

	pending := s.pending
	replayed := s.pendingBytes
	dropped := s.droppedBytes
	s.pending = nil
	s.pendingBytes = 0
	s.droppedBytes = 0
	age := time.Since(s.created)
	s.mu.Unlock()

	if previous != nil {
		// Two live clients on one character would interleave input unpredictably.
		previous.close("replaced by a newer attach")
	}

	control, _ := json.Marshal(controlPayload{
		Type:          "attached",
		SessionAgeMs:  age.Milliseconds(),
		ReplayedBytes: replayed,
		DroppedBytes:  dropped,
		Resumed:       resumed,
	})
	_ = c.sendControl(control)

	// A raw client cannot read the control payload, so tell it in the only language it
	// has. Worth the intrusion: without it there is no way to tell a resumed session
	// from a fresh one, which is the entire thing being tested.
	if resumed {
		text := "[proxy] wznowiono sesje"
		if dropped > 0 {
			text = fmt.Sprintf("%s (utracono %d bajtow starszych danych)", text, dropped)
		}
		_ = c.notice(text)
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
navigation, or a reload — rather than the backgrounding this proxy exists to survive.

Closing at once, with no grace period: a reload starting a fresh login is expected
behaviour, so there is nothing to preserve. The alternative leaves someone's character
standing in the world for the whole TTL after they shut the tab.
*/
func (s *Session) leaving() {
	s.finish("client left")
}

// finish tears the session down: the game is gone, so the client should know.
func (s *Session) finish(reason string) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	s.closeReason = reason
	client := s.client
	s.client = nil
	if s.upstream != nil {
		_ = s.upstream.Close()
	}
	s.mu.Unlock()

	if client != nil {
		client.close(reason)
	}
}

func (s *Session) isClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
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

// get returns the live session for an id, or nil.
func (m *Manager) get(id string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.sessions[id]
	if s != nil && s.isClosed() {
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
func (m *Manager) reap(now time.Time) int {
	m.mu.Lock()
	var expired []*Session
	for id, s := range m.sessions {
		if s.isClosed() {
			delete(m.sessions, id)
			continue
		}
		if s.idleFor(now) > m.ttl {
			expired = append(expired, s)
			delete(m.sessions, id)
		}
	}
	m.mu.Unlock()

	for _, s := range expired {
		s.finish("session abandoned for longer than the TTL")
	}
	return len(expired)
}

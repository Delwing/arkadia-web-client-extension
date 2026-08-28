package main

import (
	"encoding/json"
	"net"
	"sync"
	"testing"
	"time"
)

type sentChunk struct {
	at      time.Time
	payload string
}

// fakeClient records what a session sends it and can pretend to fail.
type fakeClient struct {
	mu       sync.Mutex
	chunks   []sentChunk
	controls [][]byte
	notices  []string
	failing  bool
	pings    bool
	closed   string
}

func (f *fakeClient) sendData(at time.Time, payload []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failing {
		return net.ErrClosed
	}
	f.chunks = append(f.chunks, sentChunk{at: at, payload: string(payload)})
	return nil
}

func (f *fakeClient) sendControl(payload []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := make([]byte, len(payload))
	copy(cp, payload)
	f.controls = append(f.controls, cp)
	return nil
}

func (f *fakeClient) notice(text string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.notices = append(f.notices, text)
	return nil
}

func (f *fakeClient) heartbeats() bool { return f.pings }

func (f *fakeClient) version() string { return "" }

func (f *fakeClient) close(reason string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = reason
}

func (f *fakeClient) data(t *testing.T) []string {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []string
	for _, c := range f.chunks {
		out = append(out, c.payload)
	}
	return out
}

func (f *fakeClient) control(t *testing.T) controlPayload {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.controls) == 0 {
		t.Fatal("no control payload was sent")
	}
	var c controlPayload
	if err := json.Unmarshal(f.controls[0], &c); err != nil {
		t.Fatalf("bad control payload: %v", err)
	}
	return c
}

// newTestSession builds a session over an in-memory pipe standing in for the game.
func newTestSession(t *testing.T, maxBuffer int) (*Session, net.Conn) {
	t.Helper()
	ours, theirs := net.Pipe()
	s := newSession("test-session-id-000000", theirs, maxBuffer, 20*time.Second)
	t.Cleanup(func() { s.finish("test over"); _ = ours.Close() })
	return s, ours
}

// waitFor polls until cond holds, so tests do not race the session's read goroutine.
func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition not met in time")
}

func TestFrameRoundTrip(t *testing.T) {
	at := time.UnixMilli(1724770000123)
	frame := encodeFrame(FrameData, at, []byte("Jestes w lesie."))

	kind, decoded, payload, err := decodeFrame(frame)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if kind != FrameData {
		t.Errorf("kind = %#x, want %#x", kind, FrameData)
	}
	if !decoded.Equal(at) {
		t.Errorf("time = %v, want %v", decoded, at)
	}
	if string(payload) != "Jestes w lesie." {
		t.Errorf("payload = %q", payload)
	}
}

func TestFrameRejectsShortInput(t *testing.T) {
	if _, _, _, err := decodeFrame([]byte{0x01, 0x02}); err == nil {
		t.Fatal("expected an error for a truncated frame")
	}
}

func TestOutputGoesStraightToAnAttachedClient(t *testing.T) {
	s, game := newTestSession(t, 4096)
	c := &fakeClient{}
	s.attach(c, false, -1)

	_, _ = game.Write([]byte("witaj"))

	waitFor(t, func() bool { return len(c.data(t)) == 1 })
	if got := c.data(t)[0]; got != "witaj" {
		t.Errorf("got %q, want %q", got, "witaj")
	}
}

func TestOutputIsBufferedAndReplayedInOrder(t *testing.T) {
	s, game := newTestSession(t, 4096)
	first := &fakeClient{}
	s.attach(first, false, -1)
	s.detach(first)

	// The frozen-tab case: the game keeps talking with nobody listening.
	_, _ = game.Write([]byte("jeden"))
	waitFor(t, func() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.pendingBytes == 5 })
	_, _ = game.Write([]byte("dwa"))
	waitFor(t, func() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.pendingBytes == 8 })

	second := &fakeClient{}
	s.attach(second, true, -1)

	got := second.data(t)
	if len(got) != 2 || got[0] != "jeden" || got[1] != "dwa" {
		t.Fatalf("replay = %q, want [jeden dwa]", got)
	}
	if c := second.control(t); !c.Resumed || c.ReplayedBytes != 8 {
		t.Errorf("control = %+v, want resumed with 8 replayed bytes", c)
	}
}

func TestReplayKeepsTheTimeEachChunkArrived(t *testing.T) {
	s, game := newTestSession(t, 4096)
	before := time.Now()

	_, _ = game.Write([]byte("dawno temu"))
	waitFor(t, func() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.pendingBytes > 0 })
	time.Sleep(40 * time.Millisecond)

	c := &fakeClient{}
	s.attach(c, true, -1)

	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.chunks) == 0 {
		t.Fatal("nothing was replayed")
	}
	// The whole point of framing: the chunk carries when the *game* said it, not when
	// the player came back to read it.
	if c.chunks[0].at.After(before.Add(35 * time.Millisecond)) {
		t.Errorf("replayed chunk stamped %v, which is attach time rather than arrival time", c.chunks[0].at)
	}
}

func TestResumeTellsARawClientInItsOwnLanguage(t *testing.T) {
	s, _ := newTestSession(t, 4096)

	fresh := &fakeClient{}
	s.attach(fresh, false, -1)
	if len(fresh.notices) != 0 {
		t.Errorf("a fresh session should announce nothing, got %q", fresh.notices)
	}
	s.detach(fresh)

	// A client with no control channel gets told in the only language it has, or it
	// cannot tell a resumed session from a new one.
	resumed := &fakeClient{}
	s.attach(resumed, true, -1)
	if len(resumed.notices) != 1 {
		t.Fatalf("notices = %q, want one resume line", resumed.notices)
	}
}

func TestBufferDropsOldestPastTheCap(t *testing.T) {
	s, game := newTestSession(t, 8)

	_, _ = game.Write([]byte("aaaa"))
	waitFor(t, func() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.pendingBytes == 4 })
	_, _ = game.Write([]byte("bbbb"))
	waitFor(t, func() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.pendingBytes == 8 })
	_, _ = game.Write([]byte("cccc"))
	waitFor(t, func() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.droppedBytes == 4 })

	c := &fakeClient{}
	s.attach(c, true, -1)

	got := c.data(t)
	if len(got) != 2 || got[0] != "bbbb" || got[1] != "cccc" {
		t.Fatalf("replay = %q, want the newest two chunks", got)
	}
	if ctrl := c.control(t); ctrl.DroppedBytes != 4 {
		t.Errorf("dropped = %d, want 4 so the client can warn the player", ctrl.DroppedBytes)
	}
}

func TestAFailingSendParksBytesRatherThanLosingThem(t *testing.T) {
	s, game := newTestSession(t, 4096)
	c := &fakeClient{failing: true}
	s.attach(c, false, -1)

	_, _ = game.Write([]byte("nie zginie"))

	waitFor(t, func() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.pendingBytes == 10 })
	next := &fakeClient{}
	s.attach(next, true, -1)
	if got := next.data(t); len(got) != 1 || got[0] != "nie zginie" {
		t.Fatalf("replay = %q, want the chunk the dying client never got", got)
	}
}

func TestASecondAttachReplacesTheFirst(t *testing.T) {
	s, _ := newTestSession(t, 4096)
	first := &fakeClient{}
	s.attach(first, false, -1)
	second := &fakeClient{}
	s.attach(second, true, -1)

	first.mu.Lock()
	defer first.mu.Unlock()
	if first.closed == "" {
		t.Error("the displaced client should have been closed")
	}
}

func TestPlayerInputReachesTheGame(t *testing.T) {
	s, game := newTestSession(t, 4096)

	go func() { _ = s.write([]byte("polnoc\r\n")) }()

	buf := make([]byte, 32)
	_ = game.SetReadDeadline(time.Now().Add(time.Second))
	n, err := game.Read(buf)
	if err != nil {
		t.Fatalf("game never received input: %v", err)
	}
	if got := string(buf[:n]); got != "polnoc\r\n" {
		t.Errorf("game got %q", got)
	}
}

func TestReapClosesOnlyAbandonedSessions(t *testing.T) {
	m := newManager(4096, 50*time.Millisecond)

	idle, _ := newTestSession(t, 4096)
	m.put("idle", idle)

	busy, _ := newTestSession(t, 4096)
	busy.attach(&fakeClient{}, false, -1)
	m.put("busy", busy)

	time.Sleep(80 * time.Millisecond)
	if n := m.reap(time.Now()); n != 1 {
		t.Fatalf("reaped %d, want 1", n)
	}
	if !idle.isClosed() {
		t.Error("the abandoned session should have been closed")
	}
	if busy.isClosed() {
		t.Error("a session with an attached client must survive the reaper")
	}
	if m.get("idle") != nil {
		t.Error("the reaped session should be gone from the manager")
	}
}

func TestGetForgetsClosedSessionsOnceDrained(t *testing.T) {
	m := newManager(4096, time.Minute)
	s, _ := newTestSession(t, 4096)
	m.put("gone", s)
	s.finish("upstream vanished")

	if m.get("gone") != nil {
		t.Error("a closed session with nothing left to show must not be handed out")
	}
}

func TestAnIdleTimeoutIsExplainedRatherThanSwallowed(t *testing.T) {
	m := newManager(4096, time.Minute)
	s, game := newTestSession(t, 4096)
	m.put("idled", s)

	// The player is away. Arkadia says goodbye and drops the connection — exactly what
	// its inactivity setting does — with nobody attached to see it.
	_, _ = game.Write([]byte("Zostajesz rozlaczony z powodu bezczynnosci.\r\n"))
	waitFor(t, func() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.pendingBytes > 0 })
	_ = game.Close()
	waitFor(t, func() bool { return s.isClosed() })

	// Coming back must not mean a bare login screen with no explanation.
	if m.get("idled") == nil {
		t.Fatal("a dead session still holding the game's parting words was discarded")
	}

	c := &fakeClient{}
	s.attach(c, true, -1)

	if got := c.data(t); len(got) != 1 || got[0] != "Zostajesz rozlaczony z powodu bezczynnosci.\r\n" {
		t.Errorf("replay = %q, want the game's own goodbye", got)
	}
	ctrl := c.control(t)
	if !ctrl.UpstreamClosed {
		t.Error("the client should be told the game closed this, not the proxy")
	}
	if ctrl.CloseReason == "" {
		t.Error("no reason given for the close")
	}

	// Drained: nothing left to come back for.
	m.remove("idled")
	if m.get("idled") != nil {
		t.Error("the session should be gone once its output has been collected")
	}
}

func TestLeavingClosesTheSessionAtOnce(t *testing.T) {
	m := newManager(4096, time.Hour)
	s, _ := newTestSession(t, 4096)
	c := &fakeClient{}
	s.attach(c, false, -1)
	s.detach(c)
	m.put("leaving", s)

	// A closed tab. Without this the character stands in the world for the whole TTL.
	if !s.leaving() {
		t.Fatal("leaving should act when nobody is attached")
	}
	if !s.isClosed() {
		t.Error("session should be closed immediately, not parked")
	}
	if m.get("leaving") != nil {
		t.Error("a closed session must not be handed out for resume")
	}
}

func TestLeavingIsIgnoredWhileAClientIsAttached(t *testing.T) {
	s, _ := newTestSession(t, 4096)

	// A reload: the beacon is sent as the old page unloads but delivered afterwards,
	// so the replacement page can already be attached by the time it lands. Acting on
	// it would kill the session that page is using.
	replacement := &fakeClient{}
	s.attach(replacement, true, -1)

	if s.leaving() {
		t.Error("leaving must not act while a client is attached")
	}
	if s.isClosed() {
		t.Fatal("a stale beacon closed a session someone is using")
	}
	if replacement.closed != "" {
		t.Error("the attached client should not have been disconnected")
	}
}

package main

import (
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"
)

/*
The bug this was built to catch, seen live: a phone froze its tab, the WebSocket stayed
open because the browser's network stack holds it, and the proxy kept writing into a
socket nobody was draining. Ten minutes of output went into a kernel buffer and the
player came back to an empty replay.

An open socket is not proof of a reader. The client's ping is.
*/
func TestBuffersForAnAttachedButSilentClient(t *testing.T) {
	s, _ := newTestSession(t, 4096)
	s.silenceLimit = 50 * time.Millisecond
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	// Awake: written straight through.
	s.deliver(chunk{at: time.Now(), bytes: []byte("jestes w lesie.\r\n")})
	if got := len(client.chunks); got != 1 {
		t.Fatalf("sent %d chunks to a live client, want 1", got)
	}

	// Asleep: the socket is still there, the reader is not.
	time.Sleep(60 * time.Millisecond)
	s.deliver(chunk{at: time.Now(), bytes: []byte("Ork cie atakuje!\r\n")})
	s.deliver(chunk{at: time.Now(), bytes: []byte("Umierasz.\r\n")})

	if got := len(client.chunks); got != 1 {
		t.Fatalf("wrote %d chunks into a sleeping socket, want 1", got)
	}
	s.mu.Lock()
	queued := s.pendingBytes
	s.mu.Unlock()
	if queued != 29 {
		t.Fatalf("queued %d bytes, want 29 held for the sleeper", queued)
	}
}

// Waking on a socket that never died: it missed everything written meanwhile, so the
// first thing it says should get the buffer handed over — no reconnect needed.
func TestFlushesToAClientThatWakesOnTheSameSocket(t *testing.T) {
	s, game := newTestSession(t, 4096)
	go func() { _, _ = io.ReadAll(game) }()
	s.silenceLimit = 50 * time.Millisecond
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	time.Sleep(60 * time.Millisecond)
	s.deliver(chunk{at: time.Now(), bytes: []byte("Ork cie atakuje!\r\n")})
	s.deliver(chunk{at: time.Now(), bytes: []byte("Umierasz.\r\n")})
	if len(client.chunks) != 0 {
		t.Fatal("wrote to a sleeping client")
	}

	// Its next ping proves the page is running again.
	_ = s.write([]byte("core.ping"))

	if got := len(client.chunks); got != 2 {
		t.Fatalf("handed over %d chunks on waking, want 2", got)
	}
	s.mu.Lock()
	stillHeld := s.pendingBytes
	s.mu.Unlock()
	if stillHeld != 0 {
		t.Fatalf("still holding %d bytes after the flush", stillHeld)
	}
}

// A hand-driven wscat client sends nothing for minutes and is wide awake. Silence only
// means something from a client that promised to ping.
func TestDoesNotBufferForAClientThatNeverPings(t *testing.T) {
	s, _ := newTestSession(t, 4096)
	s.silenceLimit = 50 * time.Millisecond
	client := &fakeClient{pings: false}
	s.attach(client, false, -1)

	time.Sleep(60 * time.Millisecond)
	s.deliver(chunk{at: time.Now(), bytes: []byte("nadal patrzysz.\r\n")})

	if got := len(client.chunks); got != 1 {
		t.Fatalf("buffered for a client that never claimed to ping (sent %d)", got)
	}
}

/*
"zakoncz" logs the character out, Arkadia closes the connection, and the client that is
already attached has to be told it was the *game* that ended things — otherwise a lost
socket and a finished session look identical, and the client's response to them is
opposite. Reattaching after a deliberate logout drops the player at a fresh MOTD.
*/
func TestTellsAnAttachedClientTheGameEndedIt(t *testing.T) {
	s, _ := newTestSession(t, 4096)
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)
	client.controls = nil

	s.finish("upstream closed the connection")

	if len(client.controls) != 1 {
		t.Fatalf("sent %d control frames on the game ending it, want 1", len(client.controls))
	}
	var payload controlPayload
	if err := json.Unmarshal(client.controls[0], &payload); err != nil {
		t.Fatalf("control payload: %v", err)
	}
	if !payload.UpstreamClosed {
		t.Fatal("did not say the game closed it; the client would reattach")
	}
	if payload.CloseReason == "" {
		t.Fatal("no reason given, so the player cannot be told why")
	}
}

/*
The hole this closes, taken from a real loss: a line written 13 seconds after the
client's last ping, while it still counted as live, into a socket that was already gone.
The write succeeded — into a kernel buffer belonging to a tab that never read it.

The proxy cannot know that. Only the client knows what it processed, so it says so on the
way back in, and gets exactly what it missed.
*/
func TestReplaysWritesTheClientNeverConfirmed(t *testing.T) {
	s, _ := newTestSession(t, 4096)
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	// Written while the client still looked alive, and accepted by the socket.
	s.deliver(chunk{at: time.Now(), bytes: []byte("Gruby czlowiek spoglada na ciebie.\r\n")})
	if len(client.chunks) != 1 {
		t.Fatalf("the write never went out (%d chunks)", len(client.chunks))
	}

	// The tab was in fact gone: it never speaks again and comes back on a new socket,
	// reporting that it processed nothing.
	returning := &fakeClient{pings: true}
	s.attach(returning, true, 0)

	var replayed string
	for _, c := range returning.chunks {
		replayed += c.payload
	}
	if !strings.Contains(replayed, "Gruby czlowiek") {
		t.Fatalf("the unconfirmed line was not handed back:\n%q", replayed)
	}
}

// The other half: a client that did read it must not be shown it twice.
func TestDoesNotReplayWhatTheClientAlreadyHas(t *testing.T) {
	s, _ := newTestSession(t, 4096)
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	line := []byte("Drewniana podloga skrzypi.\r\n")
	s.deliver(chunk{at: time.Now(), bytes: line})

	// It comes back saying it processed everything sent so far.
	returning := &fakeClient{pings: true}
	s.attach(returning, true, int64(len(line)))

	for _, c := range returning.chunks {
		if strings.Contains(c.payload, "Drewniana") {
			t.Fatalf("replayed a line the client already had: %q", c.payload)
		}
	}
}

// A ping is proof the page is running, so anything written before it has been read and
// need not be held.
func TestAPingReleasesEarlierWrites(t *testing.T) {
	s, game := newTestSession(t, 4096)
	go func() { _, _ = io.ReadAll(game) }()
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	s.deliver(chunk{at: time.Now(), bytes: []byte("stare wiadomosci\r\n")})
	_ = s.write([]byte("core.ping"))

	s.mu.Lock()
	held := s.unconfirmedBytes
	s.mu.Unlock()
	if held != 0 {
		t.Fatalf("still holding %d B after the client proved it was alive", held)
	}
}

/*
The reason the TTL sits past Arkadia's own idle limit: when the game logs an abandoned
character out, its parting words are in the buffer, and a player returning to a bare
login screen cannot tell an idle-out from the proxy having lost them.

The reaper used to discard any closed session on its next 30-second tick, buffer and
all — so the explanation was almost never still there to collect.
*/
func TestKeepsAClosedSessionWhileItStillHasSomethingToSay(t *testing.T) {
	m := newManager(4096, time.Hour)
	s, _ := newTestSession(t, 4096)
	m.put("kept-session-id-000000", s)

	// The game ends it while nobody is attached, leaving its last words behind.
	s.deliver(chunk{at: time.Now(), bytes: []byte("Zostajesz rozlaczony z powodu bezczynnosci.\r\n")})
	s.finish("upstream closed the connection")

	_, _ = m.reap(time.Now())

	if m.count() != 1 {
		t.Fatal("threw away a closed session that still had output waiting")
	}
	if got := m.get("kept-session-id-000000"); got == nil {
		t.Fatal("a returning player could not claim it")
	}
}

// Once drained it is genuinely finished, and holding it would leak.
func TestReapsAClosedSessionOnceItHasBeenRead(t *testing.T) {
	m := newManager(4096, time.Hour)
	s, _ := newTestSession(t, 4096)
	m.put("drained-session-id-0000", s)

	s.deliver(chunk{at: time.Now(), bytes: []byte("ostatnie slowa\r\n")})
	s.finish("upstream closed the connection")
	s.attach(&fakeClient{}, true, -1) // the player came back and read it

	_, _ = m.reap(time.Now())

	if m.count() != 0 {
		t.Fatal("held a closed session with nothing left to hand over")
	}
}

/*
The retention clock for a closed session cannot be detachedAt. A frozen tab keeps its
socket, so the client is still "attached" at the moment the game hangs up — detachedAt is
never set, idleFor answers zero forever, and the session would be held for good.
*/
func TestAClosedSessionExpiresOnItsOwnClock(t *testing.T) {
	m := newManager(4096, 50*time.Millisecond)
	s, _ := newTestSession(t, 4096)
	m.put("frozen-tab-session-000000", s)

	// The tab froze with its socket open, so it never detached.
	s.attach(&fakeClient{pings: true}, false, -1)
	s.deliver(chunk{at: time.Now(), bytes: []byte("Zostajesz rozlaczony.\r\n")})
	s.finish("upstream closed the connection")

	s.mu.Lock()
	neverDetached := s.detachedAt.IsZero()
	s.mu.Unlock()
	if !neverDetached {
		t.Fatal("test no longer covers the case it was written for")
	}

	if _, _ = m.reap(time.Now()); m.count() != 1 {
		t.Fatal("dropped it before anybody could come back for it")
	}

	time.Sleep(60 * time.Millisecond)
	_, _ = m.reap(time.Now())

	if m.count() != 0 {
		t.Fatal("held a closed session past its retention; nothing would ever free it")
	}
}

/*
A tab that wakes, takes the buffer and dies again.

Its ping proves the page was running a moment ago — not that it has read what the flush
is handing it now. Those chunks are as unconfirmed as any other write, and dropping them
from the held window left nothing to replay from: the buffer was spent, and the client
never got it.
*/
func TestAFlushedBufferIsStillHeldUntilConfirmed(t *testing.T) {
	s, game := newTestSession(t, 4096)
	go func() { _, _ = io.ReadAll(game) }()
	s.silenceLimit = 50 * time.Millisecond
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	// Asleep: buffered rather than written.
	time.Sleep(60 * time.Millisecond)
	s.deliver(chunk{at: time.Now(), bytes: []byte("Ork cie atakuje!\r\n")})

	// Awake again on the same socket, so the buffer is handed straight over.
	_ = s.write([]byte("core.ping"))
	if len(client.chunks) != 1 {
		t.Fatalf("flush sent %d chunks, want 1", len(client.chunks))
	}

	// ...and then it dies before reading any of it, coming back having processed nothing.
	returning := &fakeClient{pings: true}
	s.attach(returning, true, 0)

	var replayed string
	for _, c := range returning.chunks {
		replayed += c.payload
	}
	if !strings.Contains(replayed, "Ork cie atakuje!") {
		t.Fatalf("the flushed buffer was not held for a retry:\n%q", replayed)
	}
}

// Ordering across the two holding places: unconfirmed was written before the client went
// quiet, pending accumulated after, so a replay has to hand them over in that order.
func TestAReplayKeepsUnconfirmedAndBufferedInOrder(t *testing.T) {
	s, _ := newTestSession(t, 4096)
	s.silenceLimit = 50 * time.Millisecond
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	s.deliver(chunk{at: time.Now(), bytes: []byte("pierwsza\r\n")}) // written, unconfirmed
	time.Sleep(60 * time.Millisecond)
	s.deliver(chunk{at: time.Now(), bytes: []byte("druga\r\n")}) // buffered

	returning := &fakeClient{pings: true}
	s.attach(returning, true, 0)

	var replayed string
	for _, c := range returning.chunks {
		replayed += c.payload
	}
	if i, j := strings.Index(replayed, "pierwsza"), strings.Index(replayed, "druga"); i < 0 || j < 0 || i > j {
		t.Fatalf("replay out of order:\n%q", replayed)
	}
}

/*
A clean logout used to end with its final messages unconfirmed forever: the
acknowledgement rides on the client's next ping, and there is no next ping once the
socket is gone. The session was then held as still-owed for its whole retention — and
archived — for output the player demonstrably read.

Staying attached for a moment longer turns that into a definite answer.
*/
func TestAFinalPingDuringTheGraceConfirmsTheLastMessages(t *testing.T) {
	s, _ := newTestSessionWithGrace(t, 4096, 200*time.Millisecond)
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	s.deliver(chunk{at: time.Now(), bytes: []byte("Zegnaj.\r\n")})
	s.finish("upstream closed the connection")

	// The client is still there and still pinging, as it would be for a few more seconds.
	_ = s.write([]byte("core.ping"))

	if s.hasUnreadOutput() {
		t.Fatal("still owes output the client acknowledged during the grace")
	}
}

// Without the grace the socket is gone before any acknowledgement can arrive, and the
// session is rightly kept: unconfirmed means unconfirmed.
func TestWithoutAGraceTheLastMessagesStayOwed(t *testing.T) {
	s, _ := newTestSessionWithGrace(t, 4096, 0)
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	s.deliver(chunk{at: time.Now(), bytes: []byte("Zegnaj.\r\n")})
	s.finish("upstream closed the connection")
	_ = s.write([]byte("core.ping"))

	if !s.hasUnreadOutput() {
		t.Fatal("dropped output that was never acknowledged")
	}
}

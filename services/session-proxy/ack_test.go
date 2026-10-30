package main

import (
	"encoding/json"
	"io"
	"testing"
	"time"
)

func heldBytes(s *Session) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.unconfirmedBytes
}

// The client's own count is exact: what it says it read goes, and nothing past it does.
func TestAnAckReleasesExactlyWhatTheClientProcessed(t *testing.T) {
	s, _ := newTestSession(t, 4096)
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	first := []byte("pierwsza linia\r\n")
	s.deliver(chunk{at: time.Now(), bytes: first})
	s.deliver(chunk{at: time.Now(), bytes: []byte("druga linia\r\n")})

	s.acknowledged(client, int64(len(first)))
	if held := heldBytes(s); held != len("druga linia\r\n") {
		t.Fatalf("held %d B after acknowledging the first line only", held)
	}
}

/*
Once a client acknowledges, its pings stop releasing anything. A ping only shows the page
was running when it sent it, and a ping-based release is exactly how output in flight was
lost on a phone; the ack has the real answer.
*/
func TestPingsReleaseNothingOnceTheClientAcknowledges(t *testing.T) {
	s, game := newTestSession(t, 4096)
	go func() { _, _ = io.ReadAll(game) }()
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)
	s.acknowledged(client, 0)

	s.deliver(chunk{at: time.Now(), bytes: []byte("w drodze\r\n")})
	_ = s.write([]byte("core.ping"))
	_ = s.write([]byte("core.ping"))
	if held := heldBytes(s); held == 0 {
		t.Fatal("a ping released output the client never acknowledged")
	}
}

// A socket that has been replaced may still be speaking; its count is for a stream that
// is no longer the one being written.
func TestAnAckFromAReplacedSocketIsIgnored(t *testing.T) {
	s, _ := newTestSession(t, 4096)
	old := &fakeClient{pings: true}
	s.attach(old, false, -1)
	s.deliver(chunk{at: time.Now(), bytes: []byte("Gruby czlowiek spoglada na ciebie.\r\n")})

	current := &fakeClient{pings: true}
	s.attach(current, true, 0)
	s.acknowledged(old, 1<<20)
	if held := heldBytes(s); held == 0 {
		t.Fatal("a replaced socket released what the current one has not read")
	}
}

// Clients learn from the attach frame that acknowledgements are understood here; an older
// proxy would forward them to the game as typed input.
func TestTheAttachFrameAdvertisesAcks(t *testing.T) {
	s, _ := newTestSession(t, 4096)
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	var control controlPayload
	if err := json.Unmarshal(client.controls[0], &control); err != nil {
		t.Fatal(err)
	}
	if !control.Acks {
		t.Fatalf("attach frame does not offer acks: %s", client.controls[0])
	}
}

// A clean logout hangs up as soon as the client says it read everything, instead of
// waiting out the grace for two pings.
func TestAFinalAckEndsTheCloseGraceAtOnce(t *testing.T) {
	s, _ := newTestSessionWithGrace(t, 4096, 10*time.Second)
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	bye := []byte("Zegnaj.\r\n")
	s.deliver(chunk{at: time.Now(), bytes: bye})
	s.finish("upstream closed the connection")
	s.acknowledged(client, int64(len(bye)))

	waitFor(t, func() bool {
		client.mu.Lock()
		defer client.mu.Unlock()
		return client.closed != ""
	})
	if s.hasUnreadOutput() {
		t.Fatal("still owes output the client acknowledged")
	}
}

// An ack short of the end is no answer: the grace keeps waiting, and what is unread stays
// owed.
func TestAPartialAckKeepsTheCloseGraceWaiting(t *testing.T) {
	s, _ := newTestSessionWithGrace(t, 4096, 300*time.Millisecond)
	client := &fakeClient{pings: true}
	s.attach(client, false, -1)

	s.deliver(chunk{at: time.Now(), bytes: []byte("Zegnaj.\r\n")})
	s.finish("upstream closed the connection")
	s.acknowledged(client, 2)

	time.Sleep(100 * time.Millisecond)
	client.mu.Lock()
	closed := client.closed
	client.mu.Unlock()
	if closed != "" {
		t.Fatal("hung up on a client that had not read everything")
	}
	if !s.hasUnreadOutput() {
		t.Fatal("released output the client did not acknowledge")
	}
}

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestArchive(t *testing.T, ttl time.Duration) *archiveStore {
	t.Helper()
	store, err := newArchiveStore(t.TempDir(), ttl)
	if err != nil {
		t.Fatalf("archive store: %v", err)
	}
	return store
}

func sampleSession(closedAgo time.Duration) *archivedSession {
	now := time.Now()
	return &archivedSession{
		archiveRecord: archiveRecord{
			CreatedAt:    now.Add(-time.Hour),
			ClosedAt:     now.Add(-closedAgo),
			CloseReason:  "upstream closed the connection",
			DroppedBytes: 12,
			Produced:     64,
		},
		Chunks: []chunk{
			{at: now.Add(-closedAgo - time.Minute), offset: 0, bytes: []byte("Ork cie atakuje!\r\n")},
			{at: now.Add(-closedAgo), offset: 18, bytes: []byte("Zostajesz rozlaczony.\r\n")},
		},
	}
}

func TestArchiveRoundTrip(t *testing.T) {
	store := newTestArchive(t, time.Hour)
	want := sampleSession(time.Minute)

	if err := store.save("round-trip-session-id-00", want); err != nil {
		t.Fatalf("save: %v", err)
	}
	got := store.load("round-trip-session-id-00")

	if got == nil {
		t.Fatal("saved archive did not come back")
	}
	if got.CloseReason != want.CloseReason || got.DroppedBytes != want.DroppedBytes {
		t.Fatalf("metadata lost: %+v", got.archiveRecord)
	}
	if len(got.Chunks) != 2 {
		t.Fatalf("got %d chunks, want 2", len(got.Chunks))
	}
	if string(got.Chunks[1].bytes) != "Zostajesz rozlaczony.\r\n" {
		t.Fatalf("payload came back as %q", got.Chunks[1].bytes)
	}
	// The offsets are what let a returning client skip what it already saw.
	if got.Chunks[1].offset != 18 {
		t.Fatalf("offset came back as %d, want 18", got.Chunks[1].offset)
	}
	// Arrival times survive, or replayed output would be stamped with the moment the
	// player came back rather than when it happened.
	if !got.Chunks[0].at.Equal(want.Chunks[0].at.Truncate(time.Millisecond)) {
		t.Fatalf("timestamp came back as %v, want %v", got.Chunks[0].at, want.Chunks[0].at)
	}
}

/*
The id is a credential: whoever holds one claims a session. A directory listing must not
be a list of them, so the filename is a hash — the store can be read by anyone with disk
access without handing them the keys.
*/
func TestArchiveFilenameDoesNotLeakTheId(t *testing.T) {
	store := newTestArchive(t, time.Hour)
	id := "0123456789abcdef0123456789abcdef"

	if err := store.save(id, sampleSession(time.Minute)); err != nil {
		t.Fatalf("save: %v", err)
	}

	entries, _ := os.ReadDir(store.dir)
	for _, e := range entries {
		if strings.Contains(e.Name(), id) || strings.Contains(id, strings.TrimSuffix(e.Name(), ".gz")) {
			t.Fatalf("filename %q exposes the session id", e.Name())
		}
	}
}

func TestArchivePrunesPastRetention(t *testing.T) {
	store := newTestArchive(t, 50*time.Millisecond)
	if err := store.save("pruned-session-id-000000", sampleSession(time.Minute)); err != nil {
		t.Fatalf("save: %v", err)
	}

	if n := store.prune(time.Now()); n != 0 {
		t.Fatalf("pruned %d fresh archives", n)
	}
	time.Sleep(60 * time.Millisecond)
	if n := store.prune(time.Now()); n != 1 {
		t.Fatalf("pruned %d archives past retention, want 1", n)
	}
	if store.load("pruned-session-id-000000") != nil {
		t.Fatal("pruned archive still readable")
	}
}

// Claiming one is collecting it: leaving it behind would hand the same session to
// anything else holding the id, and it has already been spent.
func TestClaimingRemovesTheArchive(t *testing.T) {
	store := newTestArchive(t, time.Hour)
	_ = store.save("claimed-session-id-0000", sampleSession(time.Minute))

	store.remove("claimed-session-id-0000")

	if store.load("claimed-session-id-0000") != nil {
		t.Fatal("archive survived being claimed")
	}
}

/*
A convenience must never fail a player's connection. A truncated or corrupt file — a
crash mid-write, a full disk — reads as "nothing archived", and takes itself out of the
way rather than failing every future attach with that id.
*/
func TestCorruptArchiveIsTreatedAsAbsent(t *testing.T) {
	store := newTestArchive(t, time.Hour)
	id := "corrupt-session-id-0000"
	_ = store.save(id, sampleSession(time.Minute))

	path := store.path(id)
	whole, _ := os.ReadFile(path)
	if err := os.WriteFile(path, whole[:len(whole)/2], 0o600); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	if got := store.load(id); got != nil {
		t.Fatal("read a truncated archive as if it were whole")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("left the unreadable file to fail every future attach")
	}
}

func TestArchiveIsDisabledWithoutADirectory(t *testing.T) {
	store, err := newArchiveStore("", time.Hour)
	if err != nil {
		t.Fatalf("disabled store: %v", err)
	}

	if store.enabled() {
		t.Fatal("reported as enabled with nowhere to write")
	}
	if err := store.save("some-session-id-000000", sampleSession(time.Minute)); err != nil {
		t.Fatalf("save on a disabled store: %v", err)
	}
	if store.load("some-session-id-000000") != nil {
		t.Fatal("a disabled store returned an archive")
	}
	if store.count() != 0 || store.prune(time.Now()) != 0 {
		t.Fatal("a disabled store did something")
	}
}

// A crash between writing and renaming leaves a temporary file; it must not accumulate.
func TestPruneClearsAbandonedTemporaries(t *testing.T) {
	store := newTestArchive(t, 50*time.Millisecond)
	tmp := filepath.Join(store.dir, ".tmp-leftover")
	if err := os.WriteFile(tmp, []byte("half a record"), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}

	time.Sleep(60 * time.Millisecond)
	store.prune(time.Now())

	if _, err := os.Stat(tmp); !os.IsNotExist(err) {
		t.Fatal("left a temporary file behind")
	}
}

// Nothing owed, nothing stored — an empty archive would be a file that claims to hold
// something and hands back silence.
func TestNothingIsWrittenForAnEmptySession(t *testing.T) {
	store := newTestArchive(t, time.Hour)

	if err := store.save("empty-session-id-00000", &archivedSession{}); err != nil {
		t.Fatalf("save: %v", err)
	}

	if store.count() != 0 {
		t.Fatal("wrote an archive with nothing in it")
	}
}

package main

import (
	"bufio"
	"compress/gzip"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

/*
Keeping what a player is owed after the session itself is gone.

The proxy holds an ended session in memory for its TTL so a returning player reads the
game's own parting words rather than a bare login screen. That covers coming back in half
an hour. It does not cover forgetting you were playing and coming back after two, which
is the same mistake with a longer gap and exactly as unwelcome.

So instead of dropping the buffer when the TTL runs out, it goes to disk: only the bytes
nobody has read, gzipped, claimable by the same session id, and swept after a week. The
id lives in the tab's sessionStorage, so this works for as long as the tab stays open —
closing it forfeits the session, which is the deal already.

Cost is not the constraint. Measured against real traffic a full 2 MB buffer compresses
to roughly 750 KB, so thirty players abandoning one session a day for a week is about
150 MB against 36 GB free. What it does change is that gameplay — tells, deaths, party
chat — now rests on disk rather than dying with the process, which is worth knowing
before turning it on.
*/

// archiveRecord is the metadata line at the head of each file; the chunks follow it.
type archiveRecord struct {
	CreatedAt    time.Time `json:"createdAt"`
	ClosedAt     time.Time `json:"closedAt"`
	CloseReason  string    `json:"closeReason"`
	DroppedBytes int       `json:"droppedBytes"`
	Produced     int64     `json:"produced"`
}

// archivedSession is a claimable record: what ended, when, and what was never read.
type archivedSession struct {
	archiveRecord
	Chunks []chunk
}

// archiveStore is a directory of gzipped sessions, addressed by a hash of the session id.
type archiveStore struct {
	dir string
	ttl time.Duration
}

// newArchiveStore prepares the directory. A store with no directory is disabled, and
// every operation on it does nothing — the feature is opt-in.
func newArchiveStore(dir string, ttl time.Duration) (*archiveStore, error) {
	if dir == "" {
		return &archiveStore{}, nil
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("archive directory: %w", err)
	}
	return &archiveStore{dir: dir, ttl: ttl}, nil
}

func (a *archiveStore) enabled() bool { return a.dir != "" }

/*
path hashes the session id rather than using it.

The id is a credential — whoever holds one claims a session — so a directory listing must
not be a list of them. Hashing means the store can be read by anyone with disk access
without handing them the keys, and a claim still resolves in one lookup.
*/
func (a *archiveStore) path(id string) string {
	sum := sha256.Sum256([]byte(id))
	return filepath.Join(a.dir, hex.EncodeToString(sum[:])+".gz")
}

// save writes a session's unread output, replacing any earlier archive for that id.
// Written to a temporary file and renamed, so a crash mid-write cannot leave a
// half-record that would later read as a truncated session.
func (a *archiveStore) save(id string, s *archivedSession) error {
	if !a.enabled() || len(s.Chunks) == 0 {
		return nil
	}

	final := a.path(id)
	tmp, err := os.CreateTemp(a.dir, ".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())

	if err := writeArchive(tmp, s); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), final)
}

func writeArchive(w io.Writer, s *archivedSession) error {
	gz := gzip.NewWriter(w)
	header, err := json.Marshal(s.archiveRecord)
	if err != nil {
		return err
	}
	if _, err := gz.Write(append(header, '\n')); err != nil {
		return err
	}
	// Fixed-width records: when it arrived, where it sits in the stream, how long.
	// The offset is what lets a returning client skip what it already had.
	var head [20]byte
	for _, c := range s.Chunks {
		binary.BigEndian.PutUint64(head[0:8], uint64(c.at.UnixMilli()))
		binary.BigEndian.PutUint64(head[8:16], uint64(c.offset))
		binary.BigEndian.PutUint32(head[16:20], uint32(len(c.bytes)))
		if _, err := gz.Write(head[:]); err != nil {
			return err
		}
		if _, err := gz.Write(c.bytes); err != nil {
			return err
		}
	}
	return gz.Close()
}

// load returns the archived session for an id, or nil when there is none. A file that
// cannot be read is treated as absent and removed: this is a convenience, never a reason
// to fail a player's connection.
func (a *archiveStore) load(id string) *archivedSession {
	if !a.enabled() {
		return nil
	}
	path := a.path(id)
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	s, err := readArchive(f)
	// Closed before any removal: Windows will not unlink an open file, and a store that
	// silently kept its corrupt records would fail the same attach forever.
	_ = f.Close()
	if err != nil {
		_ = os.Remove(path)
		return nil
	}
	return s
}

func readArchive(r io.Reader) (*archivedSession, error) {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return nil, err
	}
	defer gz.Close()

	br := bufio.NewReader(gz)
	line, err := br.ReadBytes('\n')
	if err != nil {
		return nil, err
	}
	out := &archivedSession{}
	if err := json.Unmarshal(line[:len(line)-1], &out.archiveRecord); err != nil {
		return nil, err
	}

	var head [20]byte
	for {
		if _, err := io.ReadFull(br, head[:]); err != nil {
			if errors.Is(err, io.EOF) {
				return out, nil
			}
			return nil, err
		}
		size := binary.BigEndian.Uint32(head[16:20])
		if size > uint32(maxArchivedChunk) {
			return nil, fmt.Errorf("archived chunk of %d bytes", size)
		}
		payload := make([]byte, size)
		if _, err := io.ReadFull(br, payload); err != nil {
			return nil, err
		}
		out.Chunks = append(out.Chunks, chunk{
			at:     time.UnixMilli(int64(binary.BigEndian.Uint64(head[0:8]))),
			offset: int64(binary.BigEndian.Uint64(head[8:16])),
			bytes:  payload,
		})
	}
}

// A sanity bound on a record read back from disk, so a corrupt length cannot ask for an
// arbitrary allocation. The proxy reads the game in 32 KB bites; nothing legitimate is
// close to this.
const maxArchivedChunk = 1 << 20

// remove drops an archive, which is what claiming one amounts to.
func (a *archiveStore) remove(id string) {
	if a.enabled() {
		_ = os.Remove(a.path(id))
	}
}

// prune deletes archives older than the retention, and any temporary file a crash left
// behind. Returns how many went.
func (a *archiveStore) prune(now time.Time) int {
	if !a.enabled() {
		return 0
	}
	entries, err := os.ReadDir(a.dir)
	if err != nil {
		return 0
	}

	removed := 0
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if !expired(info, now, a.ttl) {
			continue
		}
		if os.Remove(filepath.Join(a.dir, entry.Name())) == nil {
			removed++
		}
	}
	return removed
}

func expired(info fs.FileInfo, now time.Time, ttl time.Duration) bool {
	return now.Sub(info.ModTime()) > ttl
}

// count reports how many archives are held, for /health.
func (a *archiveStore) count() int {
	if !a.enabled() {
		return 0
	}
	entries, err := os.ReadDir(a.dir)
	if err != nil {
		return 0
	}
	return len(entries)
}

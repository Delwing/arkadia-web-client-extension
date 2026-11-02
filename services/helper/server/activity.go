package server

import (
	"fmt"
	"sync"
	"time"
)

// activityLimit caps the in-memory log the status page shows.
const activityLimit = 100

// ActivityEntry is one line of what the helper has been doing.
type ActivityEntry struct {
	Time int64  `json:"time"` // unix millis
	Text string `json:"text"`
}

// activityLog is a small ring of recent events, newest last. It lives only in
// memory: it exists so the status page can say what the helper is up to right
// now, not to keep a history.
type activityLog struct {
	mu      sync.Mutex
	entries []ActivityEntry
}

func (a *activityLog) add(text string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.entries = append(a.entries, ActivityEntry{Time: time.Now().UnixMilli(), Text: text})
	if over := len(a.entries) - activityLimit; over > 0 {
		a.entries = append(a.entries[:0], a.entries[over:]...)
	}
}

func (a *activityLog) snapshot() []ActivityEntry {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]ActivityEntry(nil), a.entries...)
}

// Note records an event for the status page.
func (s *Server) Note(format string, args ...any) {
	s.activity.add(fmt.Sprintf(format, args...))
}

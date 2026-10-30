package window

import (
	"strings"
	"sync"
	"time"
)

// Detector provides window focus detection and manipulation.
type Detector interface {
	GetFocusedWindowTitle() string
	BringToFront(patterns []string) error
}

// WindowMatch is a candidate for BringToFront: a platform handle and its title.
type WindowMatch struct {
	Handle uintptr
	Title  string
}

// PickWindow chooses which window to raise.
//
// The patterns arrive in the order the web client sent them, most specific
// first (its own live tab title, then the generic fallbacks), and an earlier
// pattern always wins. That matters on a machine where several windows carry
// the game's name — a chat client in a channel called "arkadia-…", an editor
// with the repository open — and only the first pattern names the client
// itself.
func PickWindow(windows []WindowMatch, patterns []string) (WindowMatch, bool) {
	for _, p := range patterns {
		if p == "" {
			continue
		}
		needle := strings.ToLower(p)
		for _, w := range windows {
			if w.Title != "" && strings.Contains(strings.ToLower(w.Title), needle) {
				return w, true
			}
		}
	}
	return WindowMatch{}, false
}

// FocusMonitor polls the active window and matches against patterns.
type FocusMonitor struct {
	detector Detector
	mu       sync.RWMutex
	patterns []string
	focused  bool
	onChange func(focused bool)
	stop     chan struct{}
	stopOnce sync.Once
}

func NewFocusMonitor(detector Detector, onChange func(focused bool)) *FocusMonitor {
	return &FocusMonitor{
		detector: detector,
		onChange: onChange,
		stop:     make(chan struct{}),
	}
}

func (m *FocusMonitor) SetPatterns(patterns []string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.patterns = patterns
}

func (m *FocusMonitor) Start(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-m.stop:
				return
			case <-ticker.C:
				m.check()
			}
		}
	}()
}

func (m *FocusMonitor) Stop() {
	m.stopOnce.Do(func() { close(m.stop) })
}

func (m *FocusMonitor) IsFocused() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.focused
}

// BringToFront brings the browser window to front using current patterns.
func (m *FocusMonitor) BringToFront(detector Detector) {
	m.mu.RLock()
	patterns := m.patterns
	m.mu.RUnlock()
	detector.BringToFront(patterns)
}

func (m *FocusMonitor) check() {
	title := m.detector.GetFocusedWindowTitle()
	titleLower := strings.ToLower(title)

	m.mu.RLock()
	patterns := m.patterns
	m.mu.RUnlock()

	focused := false
	for _, p := range patterns {
		if strings.Contains(titleLower, strings.ToLower(p)) {
			focused = true
			break
		}
	}

	m.mu.Lock()
	changed := m.focused != focused
	m.focused = focused
	m.mu.Unlock()

	if changed && m.onChange != nil {
		m.onChange(focused)
	}
}

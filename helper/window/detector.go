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

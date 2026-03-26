//go:build !windows && !darwin && !linux

package window

// StubDetector is a no-op detector for unsupported platforms.
type StubDetector struct{}

// NewPlatformDetector returns a stub detector.
func NewPlatformDetector() Detector {
	return &StubDetector{}
}

func (d *StubDetector) GetFocusedWindowTitle() string  { return "" }
func (d *StubDetector) BringToFront(patterns []string) error { return nil }

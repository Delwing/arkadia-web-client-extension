//go:build linux

package window

import (
	"bytes"
	"os/exec"
	"strings"
)

type LinuxDetector struct {
	hasXdotool bool
	hasWmctrl  bool
}

func NewPlatformDetector() Detector {
	_, xdotoolErr := exec.LookPath("xdotool")
	_, wmctrlErr := exec.LookPath("wmctrl")
	return &LinuxDetector{hasXdotool: xdotoolErr == nil, hasWmctrl: wmctrlErr == nil}
}

func (d *LinuxDetector) GetFocusedWindowTitle() string {
	if !d.hasXdotool {
		return ""
	}
	out, err := exec.Command("xdotool", "getactivewindow", "getwindowname").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// BringToFront tries the patterns in order, so the client's own title wins over
// the generic fallbacks. Needs xdotool or wmctrl, and an X11 session — under
// Wayland neither tool can raise another application's window.
func (d *LinuxDetector) BringToFront(patterns []string) error {
	for _, p := range patterns {
		if p == "" {
			continue
		}
		if d.hasXdotool {
			// --onlyvisible keeps it off the hidden windows a browser keeps around.
			out, err := exec.Command("xdotool", "search", "--onlyvisible", "--name", p).Output()
			if err == nil && len(bytes.TrimSpace(out)) > 0 {
				windowID := strings.TrimSpace(string(bytes.Split(bytes.TrimSpace(out), []byte("\n"))[0]))
				if windowID != "" && exec.Command("xdotool", "windowactivate", "--sync", windowID).Run() == nil {
					return nil
				}
			}
		}
		if d.hasWmctrl && exec.Command("wmctrl", "-a", p).Run() == nil {
			return nil
		}
	}
	return nil
}

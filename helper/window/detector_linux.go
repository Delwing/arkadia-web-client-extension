//go:build linux

package window

import (
	"bytes"
	"os/exec"
	"strings"
)

type LinuxDetector struct {
	hasXdotool bool
}

func NewPlatformDetector() Detector {
	_, err := exec.LookPath("xdotool")
	return &LinuxDetector{hasXdotool: err == nil}
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

func (d *LinuxDetector) BringToFront(patterns []string) error {
	if !d.hasXdotool {
		return nil
	}
	for _, p := range patterns {
		out, err := exec.Command("xdotool", "search", "--name", p).Output()
		if err != nil || len(out) == 0 {
			continue
		}
		windowID := strings.TrimSpace(string(bytes.Split(out, []byte("\n"))[0]))
		if windowID != "" {
			exec.Command("xdotool", "windowactivate", windowID).Run()
			return nil
		}
	}
	return nil
}

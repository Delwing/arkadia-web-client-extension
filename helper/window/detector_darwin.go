//go:build darwin

package window

import (
	"os/exec"
	"strings"
)

type DarwinDetector struct{}

func NewPlatformDetector() Detector {
	return &DarwinDetector{}
}

func (d *DarwinDetector) GetFocusedWindowTitle() string {
	script := `tell application "System Events" to get name of first application process whose frontmost is true`
	out, err := exec.Command("osascript", "-e", script).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func (d *DarwinDetector) BringToFront(patterns []string) error {
	for _, p := range patterns {
		// Sanitize pattern to prevent AppleScript injection
		safe := strings.ReplaceAll(p, `"`, ``)
		safe = strings.ReplaceAll(safe, `\`, ``)
		script := `tell application "System Events"
			set appList to every application process whose name contains "` + safe + `"
			if (count of appList) > 0 then
				set frontmost of item 1 of appList to true
				return true
			end if
		end tell
		return false`
		exec.Command("osascript", "-e", script).Run()
	}
	return nil
}

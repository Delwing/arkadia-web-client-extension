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

// sanitize keeps a pattern safe to paste into an AppleScript string literal.
func sanitize(s string) string {
	s = strings.ReplaceAll(s, `\`, ``)
	return strings.ReplaceAll(s, `"`, ``)
}

func osascript(script string) (string, error) {
	out, err := exec.Command("osascript", "-e", script).Output()
	return strings.TrimSpace(string(out)), err
}

// GetFocusedWindowTitle returns the front window's title, falling back to the
// application's name for an app that has no window open. The title is what the
// patterns are matched against, so returning the application name alone (as
// this did) meant a browser tab never matched.
func (d *DarwinDetector) GetFocusedWindowTitle() string {
	title, err := osascript(`tell application "System Events"
		set proc to first application process whose frontmost is true
		try
			return name of front window of proc
		on error
			return name of proc
		end try
	end tell`)
	if err != nil {
		return ""
	}
	return title
}

// BringToFront raises the first window whose title matches, trying the patterns
// in order. Reading and raising other applications' windows needs the
// Accessibility permission the helper already asks for.
func (d *DarwinDetector) BringToFront(patterns []string) error {
	for _, p := range patterns {
		safe := sanitize(p)
		if safe == "" {
			continue
		}
		out, err := osascript(`tell application "System Events"
			repeat with proc in (every application process whose background only is false)
				repeat with w in (every window of proc)
					if name of w contains "` + safe + `" then
						set frontmost of proc to true
						try
							perform action "AXRaise" of w
						end try
						return "true"
					end if
				end repeat
			end repeat
		end tell
		return "false"`)
		if err == nil && out == "true" {
			return nil
		}
	}
	return nil
}

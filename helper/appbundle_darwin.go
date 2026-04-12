//go:build darwin

package main

import "strings"

// isInsideAppBundle reports whether the executable is running inside
// a macOS .app bundle. When macOS opens an arkadia:// URL it launches
// the app bundle without passing the URL as a CLI argument (it is
// delivered via Apple Events instead), so we use the bundle path as a
// signal that this is a protocol-initiated launch.
func isInsideAppBundle(execPath string) bool {
	return strings.Contains(execPath, ".app/Contents/MacOS/")
}

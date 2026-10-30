//go:build darwin

package main

import "runtime"

// macOS requires AppKit/Cocoa calls to run on the process's main OS thread —
// the system tray creates an NSStatusItem backed by an NSWindow, which aborts
// with "NSWindow should be instantiated on the main thread!" otherwise. Go does
// not keep the main goroutine pinned to the main OS thread once cgo calls and
// goroutine scheduling begin, so the tray setup can end up on a secondary
// thread. Calling LockOSThread from init runs while the main goroutine is still
// guaranteed to be on the main OS thread, pinning it there for the lifetime of
// the process; main() (and therefore tray.Run) then executes on the main thread.
func init() {
	runtime.LockOSThread()
}

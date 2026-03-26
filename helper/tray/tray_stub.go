//go:build !windows

package tray

import (
	"log"
	"os"
	"os/signal"
	"syscall"
)

// Stub: on non-Windows, just log to stdout and wait for signal.
func run(title string, cb Callbacks, ready func()) {
	log.Printf("%s — tray not available on this platform, running in foreground", title)
	ready()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	if cb.OnQuit != nil {
		cb.OnQuit()
	}
}

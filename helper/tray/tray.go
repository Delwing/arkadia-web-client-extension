package tray

import _ "embed"

//go:embed favicon.ico
var IconData []byte

// Callbacks for tray events.
type Callbacks struct {
	OnQuit       func()
	OnUnregister func()
}

// Run starts the system tray application. Blocks until quit.
// Platform-specific implementations in tray_windows.go / tray_stub.go.
func Run(title string, cb Callbacks, ready func()) {
	run(title, cb, ready)
}

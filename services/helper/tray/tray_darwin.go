//go:build darwin

package tray

/*
#cgo LDFLAGS: -framework Cocoa
#include <stdlib.h>

extern void trayOnQuit();
extern void trayOnUnregister();

void setupTray(const char* title, const void* iconData, int iconLen);
void runApp();
*/
import "C"

import (
	"unsafe"
)

var darwinCb Callbacks

//export trayOnQuit
func trayOnQuit() {
	if darwinCb.OnQuit != nil {
		darwinCb.OnQuit()
	}
}

//export trayOnUnregister
func trayOnUnregister() {
	if darwinCb.OnUnregister != nil {
		darwinCb.OnUnregister()
	}
}

func run(title string, cb Callbacks, ready func()) {
	darwinCb = cb

	go ready()

	cTitle := C.CString(title)
	defer C.free(unsafe.Pointer(cTitle))

	C.setupTray(cTitle, unsafe.Pointer(&IconData[0]), C.int(len(IconData)))
	C.runApp() // blocks
}

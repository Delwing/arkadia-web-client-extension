//go:build windows

package window

import (
	"runtime"
	"syscall"
	"unsafe"
)

var (
	user32               = syscall.NewLazyDLL("user32.dll")
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	getForegroundWindow  = user32.NewProc("GetForegroundWindow")
	getWindowTextW       = user32.NewProc("GetWindowTextW")
	getWindowTextLengthW = user32.NewProc("GetWindowTextLengthW")
	setForegroundWindow  = user32.NewProc("SetForegroundWindow")
	enumWindows          = user32.NewProc("EnumWindows")
	isWindowVisible      = user32.NewProc("IsWindowVisible")
	isIconic             = user32.NewProc("IsIconic")
	showWindow           = user32.NewProc("ShowWindow")
	bringWindowToTop     = user32.NewProc("BringWindowToTop")
	attachThreadInput    = user32.NewProc("AttachThreadInput")
	getWindowThreadPID   = user32.NewProc("GetWindowThreadProcessId")
	getCurrentThreadID   = kernel32.NewProc("GetCurrentThreadId")
)

const swRestore = 9

type WindowsDetector struct{}

func NewPlatformDetector() Detector {
	return &WindowsDetector{}
}

func (d *WindowsDetector) GetFocusedWindowTitle() string {
	hwnd, _, _ := getForegroundWindow.Call()
	if hwnd == 0 {
		return ""
	}
	return getWindowTitle(hwnd)
}

func (d *WindowsDetector) BringToFront(patterns []string) error {
	match, ok := PickWindow(visibleWindows(), patterns)
	if !ok {
		return nil
	}
	forceForeground(match.Handle)
	return nil
}

// raised reports whether the window is now the foreground one.
func raised(hwnd uintptr) bool {
	fg, _, _ := getForegroundWindow.Call()
	return fg == hwnd
}

// visibleWindows lists the top-level windows a user could switch to, in z-order.
// Hidden ones are skipped: every browser keeps a few, and raising one does nothing.
func visibleWindows() []WindowMatch {
	var found []WindowMatch
	cb := syscall.NewCallback(func(hwnd, lparam uintptr) uintptr {
		if visible, _, _ := isWindowVisible.Call(hwnd); visible == 0 {
			return 1
		}
		if title := getWindowTitle(hwnd); title != "" {
			found = append(found, WindowMatch{Handle: hwnd, Title: title})
		}
		return 1
	})
	enumWindows.Call(cb, 0)
	return found
}

/*
forceForeground raises a window from a process that is not the foreground one.

SetForegroundWindow alone is refused in that case — Windows flashes the taskbar
button instead of switching — because the helper is a background process: it
watches the keyboard through a low-level hook, so the keystroke that asks for
this is delivered to whatever application is actually in front, never to us.
Attaching our input queue to the foreground window's thread for the duration
makes the call legal, which is the long-standing way to do this. A minimized
window is restored first, or it would be raised without ever becoming visible.
*/
func forceForeground(hwnd uintptr) {
	// AttachThreadInput works on the calling OS thread, so it has to stay put.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	if iconic, _, _ := isIconic.Call(hwnd); iconic != 0 {
		showWindow.Call(hwnd, swRestore)
	}

	fg, _, _ := getForegroundWindow.Call()
	if fg == hwnd {
		return
	}

	var fgThread uintptr
	if fg != 0 {
		fgThread, _, _ = getWindowThreadPID.Call(fg, 0)
	}
	myThread, _, _ := getCurrentThreadID.Call()

	attached := false
	if fgThread != 0 && fgThread != myThread {
		if r, _, _ := attachThreadInput.Call(myThread, fgThread, 1); r != 0 {
			attached = true
		}
	}

	bringWindowToTop.Call(hwnd)
	setForegroundWindow.Call(hwnd)

	if attached {
		attachThreadInput.Call(myThread, fgThread, 0)
	}
}

func getWindowTitle(hwnd uintptr) string {
	length, _, _ := getWindowTextLengthW.Call(hwnd)
	if length == 0 {
		return ""
	}
	buf := make([]uint16, length+1)
	getWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), length+1)
	return syscall.UTF16ToString(buf)
}

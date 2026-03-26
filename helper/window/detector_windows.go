//go:build windows

package window

import (
	"strings"
	"syscall"
	"unsafe"
)

var (
	user32               = syscall.NewLazyDLL("user32.dll")
	getForegroundWindow  = user32.NewProc("GetForegroundWindow")
	getWindowTextW       = user32.NewProc("GetWindowTextW")
	getWindowTextLengthW = user32.NewProc("GetWindowTextLengthW")
	setForegroundWindow  = user32.NewProc("SetForegroundWindow")
	enumWindows          = user32.NewProc("EnumWindows")
)

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
	var found uintptr
	cb := syscall.NewCallback(func(hwnd, lparam uintptr) uintptr {
		title := getWindowTitle(hwnd)
		for _, p := range patterns {
			if len(title) > 0 && strings.Contains(strings.ToLower(title), strings.ToLower(p)) {
				found = hwnd
				return 0
			}
		}
		return 1
	})
	enumWindows.Call(cb, 0)
	if found != 0 {
		setForegroundWindow.Call(found)
	}
	return nil
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

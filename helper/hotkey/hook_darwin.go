//go:build darwin

package hotkey

/*
#cgo LDFLAGS: -framework CoreGraphics -framework CoreFoundation
#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>

extern CGEventRef darwinEventTapCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon);

static inline CGEventRef nullCGEvent() { return NULL; }
*/
import "C"

import (
	"fmt"
	"log"
	"sync"
	"unsafe"
)

// macOS virtual keycodes to our VK codes
var macKeyToVK = map[C.CGKeyCode]KeyCode{
	0x00: VKFromChar('a'), 0x01: VKFromChar('s'), 0x02: VKFromChar('d'),
	0x03: VKFromChar('f'), 0x04: VKFromChar('h'), 0x05: VKFromChar('g'),
	0x06: VKFromChar('z'), 0x07: VKFromChar('x'), 0x08: VKFromChar('c'),
	0x09: VKFromChar('v'), 0x0B: VKFromChar('b'), 0x0C: VKFromChar('q'),
	0x0D: VKFromChar('w'), 0x0E: VKFromChar('e'), 0x0F: VKFromChar('r'),
	0x10: VKFromChar('y'), 0x11: VKFromChar('t'), 0x12: VKFromChar('1'),
	0x13: VKFromChar('2'), 0x14: VKFromChar('3'), 0x15: VKFromChar('4'),
	0x16: VKFromChar('6'), 0x17: VKFromChar('5'), 0x1C: VKFromChar('8'),
	0x19: VKFromChar('9'), 0x1D: VKFromChar('0'), 0x1E: VKFromChar('7'),
	0x1F: VKFromChar('o'), 0x20: VKFromChar('u'), 0x22: VKFromChar('i'),
	0x23: VKFromChar('p'), 0x25: VKFromChar('l'), 0x26: VKFromChar('j'),
	0x28: VKFromChar('k'), 0x2D: VKFromChar('n'), 0x2E: VKFromChar('m'),
	0x30: VK_TAB, 0x31: VK_SPACE, 0x33: VK_BACK, 0x24: VK_RETURN,
	0x35: VK_ESCAPE, 0x75: VK_DELETE,
	0x7B: VK_LEFT, 0x7C: VK_RIGHT, 0x7D: VK_DOWN, 0x7E: VK_UP,
	0x7A: VKFunctionKey(1), 0x78: VKFunctionKey(2), 0x63: VKFunctionKey(3),
	0x76: VKFunctionKey(4), 0x60: VKFunctionKey(5), 0x61: VKFunctionKey(6),
	0x62: VKFunctionKey(7), 0x64: VKFunctionKey(8), 0x65: VKFunctionKey(9),
	0x6D: VKFunctionKey(10), 0x67: VKFunctionKey(11), 0x6F: VKFunctionKey(12),
}

// macOS modifier flag masks
const (
	kCGEventFlagMaskControl = C.CGEventFlags(0x00040000)
	kCGEventFlagMaskAlt     = C.CGEventFlags(0x00080000)
	kCGEventFlagMaskShift   = C.CGEventFlags(0x00020000)
)

var (
	darwinMu       sync.Mutex
	darwinCb       hookCallback
	darwinRunning  bool
	darwinRunLoop  C.CFRunLoopRef
	darwinCapMu    sync.Mutex
	darwinCapCb    captureCallback
)

func macFlagsToMods(flags C.CGEventFlags) Modifier {
	var m Modifier
	if flags&kCGEventFlagMaskControl != 0 {
		m |= ModCtrl
	}
	if flags&kCGEventFlagMaskAlt != 0 {
		m |= ModAlt
	}
	if flags&kCGEventFlagMaskShift != 0 {
		m |= ModShift
	}
	return m
}

//export darwinEventTapCallback
func darwinEventTapCallback(proxy C.CGEventTapProxy, evType C.CGEventType, event C.CGEventRef, refcon unsafe.Pointer) C.CGEventRef {
	if evType != C.kCGEventKeyDown {
		return event
	}

	keycode := C.CGEventGetIntegerValueField(event, C.kCGKeyboardEventKeycode)
	vk, ok := macKeyToVK[C.CGKeyCode(keycode)]
	if !ok {
		return event
	}

	flags := C.CGEventGetFlags(event)
	mods := macFlagsToMods(flags)
	ke := KeyEvent{VK: vk, Mods: mods}

	// Check capture mode
	darwinCapMu.Lock()
	capCb := darwinCapCb
	if capCb != nil {
		if vk == VK_ESCAPE {
			darwinCapCb = nil
			darwinCapMu.Unlock()
			go capCb(KeyEvent{})
			return C.nullCGEvent() // suppress
		}
		darwinCapCb = nil
		darwinCapMu.Unlock()
		go capCb(ke)
		return C.nullCGEvent() // suppress
	}
	darwinCapMu.Unlock()

	// Normal hotkey handling
	darwinMu.Lock()
	cb := darwinCb
	darwinMu.Unlock()

	if cb != nil && cb(ke) {
		return C.nullCGEvent() // suppress
	}

	return event
}

func InstallHook(cb hookCallback) error {
	darwinMu.Lock()
	defer darwinMu.Unlock()

	if darwinRunning {
		return fmt.Errorf("hook already installed")
	}

	darwinCb = cb
	darwinRunning = true

	return nil
}

func UninstallHook() {
	darwinMu.Lock()
	defer darwinMu.Unlock()

	darwinRunning = false
	darwinCb = nil

	if darwinRunLoop != 0 {
		C.CFRunLoopStop(darwinRunLoop)
		darwinRunLoop = 0
	}
}

// PlatformGrab is a no-op on macOS — the event tap sees all keys.
func PlatformGrab(mods Modifier, vk KeyCode) error { return nil }

// PlatformUngrab is a no-op on macOS.
func PlatformUngrab(mods Modifier, vk KeyCode) {}

func SetCaptureCallback(cb captureCallback) {
	darwinCapMu.Lock()
	defer darwinCapMu.Unlock()
	darwinCapCb = cb
}

// RunMessagePump creates the CGEventTap and runs the CFRunLoop.
func RunMessagePump() {
	eventMask := C.CGEventMask(1 << C.kCGEventKeyDown)

	tap := C.CGEventTapCreate(
		C.kCGSessionEventTap,
		C.kCGHeadInsertEventTap,
		0, // active tap (can modify/suppress events)
		eventMask,
		C.CGEventTapCallBack(C.darwinEventTapCallback),
		nil,
	)
	if tap == 0 {
		log.Println("Failed to create CGEventTap. Make sure Accessibility permissions are granted.")
		return
	}

	source := C.CFMachPortCreateRunLoopSource(C.kCFAllocatorDefault, tap, 0)
	darwinRunLoop = C.CFRunLoopGetCurrent()
	C.CFRunLoopAddSource(darwinRunLoop, source, C.kCFRunLoopCommonModes)
	C.CGEventTapEnable(tap, C.bool(true))

	C.CFRunLoopRun()

	// Cleanup
	C.CFRunLoopRemoveSource(darwinRunLoop, source, C.kCFRunLoopCommonModes)
	C.CFRelease(C.CFTypeRef(source))
	C.CFRelease(C.CFTypeRef(tap))
}

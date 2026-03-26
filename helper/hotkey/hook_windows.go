//go:build windows

package hotkey

import (
	"fmt"
	"sync"
	"syscall"
	"unsafe"
)

var (
	user32               = syscall.NewLazyDLL("user32.dll")
	pSetWindowsHookEx    = user32.NewProc("SetWindowsHookExW")
	pCallNextHookEx      = user32.NewProc("CallNextHookEx")
	pUnhookWindowsHookEx = user32.NewProc("UnhookWindowsHookEx")
	pGetMessage          = user32.NewProc("GetMessageW")
	pGetAsyncKeyState    = user32.NewProc("GetAsyncKeyState")
)

const (
	WH_KEYBOARD_LL = 13
	WM_KEYDOWN     = 0x0100
	WM_KEYUP       = 0x0101
	WM_SYSKEYDOWN  = 0x0104
	WM_SYSKEYUP    = 0x0105
	VK_LCONTROL    = 0xA2
	VK_RCONTROL    = 0xA3
	VK_LMENU       = 0xA4 // Left Alt
	VK_RMENU       = 0xA5 // Right Alt
	VK_LSHIFT      = 0xA0
	VK_RSHIFT      = 0xA1
	VK_CONTROL     = 0x11
	VK_MENU        = 0x12 // Alt
	VK_SHIFT_KEY   = 0x10
)

type KBDLLHOOKSTRUCT struct {
	VkCode      uint32
	ScanCode    uint32
	Flags       uint32
	Time        uint32
	DwExtraInfo uintptr
}


var (
	hookMu        sync.Mutex
	hookHandle    uintptr
	hookCb        hookCallback
	hookInstalled bool

	// Capture state
	captureMu     sync.Mutex
	captureCb     captureCallback
	captureEvent  *KeyEvent // the combo being built during capture
	keysDown      int       // count of non-modifier keys currently held
)

func isModifierVK(vk uint32) bool {
	return vk == VK_CONTROL || vk == VK_LCONTROL || vk == VK_RCONTROL ||
		vk == VK_MENU || vk == VK_LMENU || vk == VK_RMENU ||
		vk == VK_SHIFT_KEY || vk == VK_LSHIFT || vk == VK_RSHIFT
}

func isKeyDown(vk int) bool {
	ret, _, _ := pGetAsyncKeyState.Call(uintptr(vk))
	return ret&0x8000 != 0
}

func currentModifiers() Modifier {
	var m Modifier
	if isKeyDown(VK_CONTROL) {
		m |= ModCtrl
	}
	if isKeyDown(VK_MENU) {
		m |= ModAlt
	}
	if isKeyDown(VK_SHIFT_KEY) {
		m |= ModShift
	}
	return m
}

func lowLevelKeyboardProc(nCode int, wParam uintptr, lParam uintptr) uintptr {
	if nCode < 0 {
		ret, _, _ := pCallNextHookEx.Call(0, uintptr(nCode), wParam, lParam)
		return ret
	}

	kb := (*KBDLLHOOKSTRUCT)(unsafe.Pointer(lParam))
	vk := kb.VkCode
	isMod := isModifierVK(vk)
	isDown := wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN
	isUp := wParam == WM_KEYUP || wParam == WM_SYSKEYUP

	// Handle capture mode
	captureMu.Lock()
	cb := captureCb
	if cb != nil {
		// Escape cancels capture
		if isDown && vk == 0x1B {
			captureCb = nil
			captureEvent = nil
			keysDown = 0
			captureMu.Unlock()
			go cb(KeyEvent{}) // empty event = cancelled
			return 1
		}
		if isDown && !isMod {
			// Record the combo (last non-modifier keydown wins)
			mods := currentModifiers()
			captureEvent = &KeyEvent{VK: KeyCode(vk), Mods: mods}
			keysDown++
			captureMu.Unlock()
			return 1 // suppress
		}
		if isUp && !isMod {
			keysDown--
			if keysDown <= 0 && captureEvent != nil {
				// All non-modifier keys released — fire capture
				event := *captureEvent
				captureCb = nil
				captureEvent = nil
				keysDown = 0
				captureMu.Unlock()
				go cb(event)
				return 1 // suppress
			}
			captureMu.Unlock()
			return 1 // suppress
		}
		// Let modifier keys pass through so GetAsyncKeyState can track them
		captureMu.Unlock()
		ret, _, _ := pCallNextHookEx.Call(0, uintptr(nCode), wParam, lParam)
		return ret
	}
	captureMu.Unlock()

	// Normal hotkey mode — only handle keydown for non-modifiers
	if isDown && !isMod {
		mods := currentModifiers()
		event := KeyEvent{VK: KeyCode(vk), Mods: mods}

		hookMu.Lock()
		normalCb := hookCb
		hookMu.Unlock()

		if normalCb != nil && normalCb(event) {
			return 1 // suppress
		}
	}

	ret, _, _ := pCallNextHookEx.Call(0, uintptr(nCode), wParam, lParam)
	return ret
}

// SetCaptureCallback sets a one-shot capture callback. The next full key combo
// (press + release) will be reported and then capture mode exits.
func SetCaptureCallback(cb captureCallback) {
	captureMu.Lock()
	defer captureMu.Unlock()
	captureCb = cb
	captureEvent = nil
	keysDown = 0
}

// InstallHook installs the low-level keyboard hook. Must be called from a thread
// with a message pump. The callback is called for every keydown; return true to suppress.
func InstallHook(cb hookCallback) error {
	hookMu.Lock()
	defer hookMu.Unlock()

	if hookInstalled {
		return fmt.Errorf("hook already installed")
	}

	hookCb = cb
	handle, _, err := pSetWindowsHookEx.Call(
		WH_KEYBOARD_LL,
		syscall.NewCallback(lowLevelKeyboardProc),
		0,
		0,
	)
	if handle == 0 {
		return fmt.Errorf("SetWindowsHookEx failed: %v", err)
	}
	hookHandle = handle
	hookInstalled = true
	return nil
}

// UninstallHook removes the keyboard hook.
func UninstallHook() {
	hookMu.Lock()
	defer hookMu.Unlock()

	if hookInstalled && hookHandle != 0 {
		pUnhookWindowsHookEx.Call(hookHandle)
		hookHandle = 0
		hookInstalled = false
		hookCb = nil
	}
}

// PlatformGrab is a no-op on Windows — the global hook sees all keys.
func PlatformGrab(mods Modifier, vk KeyCode) error { return nil }

// PlatformUngrab is a no-op on Windows.
func PlatformUngrab(mods Modifier, vk KeyCode) {}

// RunMessagePump runs the Windows message pump. This must run on the same
// thread that installed the hook. It blocks until the hook is uninstalled.
func RunMessagePump() {
	type MSG struct {
		Hwnd    uintptr
		Message uint32
		WParam  uintptr
		LParam  uintptr
		Time    uint32
		Pt      struct{ X, Y int32 }
	}
	var msg MSG
	for {
		ret, _, _ := pGetMessage.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if ret == 0 || ret == uintptr(^uintptr(0)) { // 0 = WM_QUIT, -1 = error
			break
		}
	}
}

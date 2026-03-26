package hotkey

import (
	"fmt"
	"strings"
)

// Virtual key codes, modifier flags, and shared types used across platforms.
// On Windows the key codes map directly to VK_ constants.

// hookCallback is the function signature for the keyboard hook.
// Return true to suppress the key event from reaching other applications.
type hookCallback func(event KeyEvent) bool

// KeyEvent represents a key press with modifiers.
type KeyEvent struct {
	VK   KeyCode
	Mods Modifier
}

// ComboString returns the human-readable key combo string, e.g. "ctrl+shift+w".
func (e KeyEvent) ComboString() string {
	var parts []string
	if e.Mods&ModCtrl != 0 {
		parts = append(parts, "ctrl")
	}
	if e.Mods&ModAlt != 0 {
		parts = append(parts, "alt")
	}
	if e.Mods&ModShift != 0 {
		parts = append(parts, "shift")
	}
	name := VKName(e.VK)
	if name == "" {
		name = fmt.Sprintf("0x%02X", e.VK)
	}
	parts = append(parts, name)
	return strings.Join(parts, "+")
}

// captureCallback is called when capture mode detects a full key combo.
type captureCallback func(event KeyEvent)

type Modifier int

const (
	ModCtrl  Modifier = 1 << 0
	ModAlt   Modifier = 1 << 1
	ModShift Modifier = 1 << 2
)

type KeyCode uint32

// Common virtual key codes (matching Windows VK_ values).
const (
	VK_BACK   KeyCode = 0x08
	VK_TAB    KeyCode = 0x09
	VK_RETURN KeyCode = 0x0D
	VK_ESCAPE KeyCode = 0x1B
	VK_SPACE  KeyCode = 0x20
	VK_DELETE KeyCode = 0x2E
	VK_LEFT   KeyCode = 0x25
	VK_UP     KeyCode = 0x26
	VK_RIGHT  KeyCode = 0x27
	VK_DOWN   KeyCode = 0x28
)

// VK_0 through VK_9 are 0x30-0x39 (same as ASCII '0'-'9')
// VK_A through VK_Z are 0x41-0x5A (same as ASCII 'A'-'Z')
// VK_F1 through VK_F12 are 0x70-0x7B

func VKFromChar(c byte) KeyCode {
	if c >= 'a' && c <= 'z' {
		return KeyCode(c - 'a' + 0x41)
	}
	if c >= 'A' && c <= 'Z' {
		return KeyCode(c)
	}
	if c >= '0' && c <= '9' {
		return KeyCode(c)
	}
	return 0
}

func VKFunctionKey(n int) KeyCode {
	if n >= 1 && n <= 12 {
		return KeyCode(0x6F + n) // VK_F1=0x70
	}
	return 0
}

var keyNameToVK = map[string]KeyCode{
	"backspace": VK_BACK,
	"tab":       VK_TAB,
	"return":    VK_RETURN,
	"enter":     VK_RETURN,
	"escape":    VK_ESCAPE,
	"esc":       VK_ESCAPE,
	"space":     VK_SPACE,
	"delete":    VK_DELETE,
	"del":       VK_DELETE,
	"left":      VK_LEFT,
	"up":        VK_UP,
	"right":     VK_RIGHT,
	"down":      VK_DOWN,
}

var vkToName map[KeyCode]string

func init() {
	vkToName = make(map[KeyCode]string)
	for c := byte('a'); c <= 'z'; c++ {
		vkToName[VKFromChar(c)] = string(c)
	}
	for c := byte('0'); c <= '9'; c++ {
		vkToName[VKFromChar(c)] = string(c)
	}
	for i := 1; i <= 12; i++ {
		vkToName[VKFunctionKey(i)] = fmt.Sprintf("f%d", i)
	}
	vkToName[VK_BACK] = "backspace"
	vkToName[VK_TAB] = "tab"
	vkToName[VK_RETURN] = "enter"
	vkToName[VK_ESCAPE] = "escape"
	vkToName[VK_SPACE] = "space"
	vkToName[VK_DELETE] = "delete"
	vkToName[VK_LEFT] = "left"
	vkToName[VK_UP] = "up"
	vkToName[VK_RIGHT] = "right"
	vkToName[VK_DOWN] = "down"
}

// VKName returns the human-readable name for a virtual key code.
func VKName(vk KeyCode) string {
	if name, ok := vkToName[vk]; ok {
		return name
	}
	return ""
}

package hotkey

import (
	"fmt"
	"strings"
)

var modifierNames = map[string]Modifier{
	"ctrl":  ModCtrl,
	"shift": ModShift,
	"alt":   ModAlt,
}

// ParseKeyCombo parses a key combo string like "ctrl+shift+w" into
// a modifier bitmask and a virtual key code.
func ParseKeyCombo(combo string) (Modifier, KeyCode, error) {
	if combo == "" {
		return 0, 0, fmt.Errorf("empty key combo")
	}

	parts := strings.Split(strings.ToLower(strings.TrimSpace(combo)), "+")
	if len(parts) == 0 {
		return 0, 0, fmt.Errorf("empty key combo")
	}

	var mods Modifier
	var keyStr string

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if mod, ok := modifierNames[part]; ok {
			mods |= mod
		} else {
			keyStr = part
		}
	}

	if keyStr == "" {
		return 0, 0, fmt.Errorf("no key found in combo %q", combo)
	}

	// Try named keys first
	if vk, ok := keyNameToVK[keyStr]; ok {
		return mods, vk, nil
	}

	// Try function keys: f1-f12
	if len(keyStr) >= 2 && keyStr[0] == 'f' {
		var n int
		if _, err := fmt.Sscanf(keyStr, "f%d", &n); err == nil {
			if vk := VKFunctionKey(n); vk != 0 {
				return mods, vk, nil
			}
		}
	}

	// Try single character
	if len(keyStr) == 1 {
		if vk := VKFromChar(keyStr[0]); vk != 0 {
			return mods, vk, nil
		}
	}

	return 0, 0, fmt.Errorf("unknown key %q in combo %q", keyStr, combo)
}

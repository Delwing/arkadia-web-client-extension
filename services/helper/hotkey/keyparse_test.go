package hotkey

import (
	"testing"
)

func TestParseKeyCombo(t *testing.T) {
	tests := []struct {
		input    string
		wantMods Modifier
		wantKey  KeyCode
		wantErr  bool
	}{
		{"ctrl+w", ModCtrl, VKFromChar('w'), false},
		{"ctrl+shift+q", ModCtrl | ModShift, VKFromChar('q'), false},
		{"alt+f4", ModAlt, VKFunctionKey(4), false},
		{"ctrl+alt+1", ModCtrl | ModAlt, VKFromChar('1'), false},
		{"f5", 0, VKFunctionKey(5), false},
		{"ctrl+shift+alt+a", ModCtrl | ModShift | ModAlt, VKFromChar('a'), false},
		{"", 0, 0, true},
		{"ctrl+", 0, 0, true},
		{"ctrl+unknownkey", 0, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			mods, key, err := ParseKeyCombo(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseKeyCombo(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if err != nil {
				return
			}
			if key != tt.wantKey {
				t.Errorf("ParseKeyCombo(%q) key = %v, want %v", tt.input, key, tt.wantKey)
			}
			if mods != tt.wantMods {
				t.Errorf("ParseKeyCombo(%q) mods = %v, want %v", tt.input, mods, tt.wantMods)
			}
		})
	}
}

// The functional bind lives on "]" and the directions on the numpad, so these
// have to survive the round trip the web client and the capture both rely on.
func TestParseKeyComboCoversPunctuationAndNumpad(t *testing.T) {
	cases := map[string]KeyCode{
		"rbracket": VK_OEM_6,
		"lbracket": VK_OEM_4,
		"grave":    VK_OEM_3,
		"minus":    VK_OEM_MINUS,
		"slash":    VK_OEM_2,
		"num8":     VKNumpad(8),
		"numadd":   VK_ADD,
		"numdiv":   VK_DIVIDE,
	}
	for name, want := range cases {
		mods, key, err := ParseKeyCombo("ctrl+" + name)
		if err != nil || key != want || mods != ModCtrl {
			t.Fatalf("ParseKeyCombo(ctrl+%s) = %v, %v, %v", name, mods, key, err)
		}
		if got := (KeyEvent{Mods: ModCtrl, VK: key}).ComboString(); got != "ctrl+"+name {
			t.Fatalf("ComboString for %s = %q", name, got)
		}
	}
}

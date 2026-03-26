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

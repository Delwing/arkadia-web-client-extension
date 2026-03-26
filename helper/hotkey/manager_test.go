package hotkey

import (
	"testing"

	"github.com/delwing/arkadia-web-client-extension/helper/protocol"
)

func TestShouldFireBrowserOnly(t *testing.T) {
	m := NewManager(nil, nil)
	bind := protocol.Bind{ID: "test", Key: "ctrl+w", Mode: protocol.ModeBrowserOnly}

	m.SetBrowserFocused(false)
	if m.shouldFire(bind) {
		t.Error("browser_only bind should not fire when browser is not focused")
	}

	m.SetBrowserFocused(true)
	if !m.shouldFire(bind) {
		t.Error("browser_only bind should fire when browser is focused")
	}
}

func TestShouldFireGlobal(t *testing.T) {
	m := NewManager(nil, nil)
	bind := protocol.Bind{ID: "test", Key: "ctrl+q", Mode: protocol.ModeGlobal}

	m.SetBrowserFocused(false)
	if !m.shouldFire(bind) {
		t.Error("global bind should fire regardless of focus")
	}

	m.SetBrowserFocused(true)
	if !m.shouldFire(bind) {
		t.Error("global bind should fire regardless of focus")
	}
}

func TestShouldFireGlobalFocus(t *testing.T) {
	m := NewManager(nil, nil)
	bind := protocol.Bind{ID: "test", Key: "ctrl+q", Mode: protocol.ModeGlobalFocus}

	m.SetBrowserFocused(false)
	if !m.shouldFire(bind) {
		t.Error("global_focus bind should fire regardless of focus")
	}
}

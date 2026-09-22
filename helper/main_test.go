package main

import (
	"encoding/json"
	"sort"
	"testing"

	hk "github.com/delwing/arkadia-web-client-extension/helper/hotkey"
	"github.com/delwing/arkadia-web-client-extension/helper/protocol"
	"github.com/delwing/arkadia-web-client-extension/helper/server"
	"github.com/delwing/arkadia-web-client-extension/helper/window"
)

func registerBinds(t *testing.T, mgr *hk.Manager, binds ...protocol.Bind) {
	t.Helper()
	payload, err := json.Marshal(protocol.RegisterBindsMsg{Type: protocol.TypeRegisterBinds, Binds: binds})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var env protocol.Envelope
	if err := json.Unmarshal(payload, &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	detector := window.NewPlatformDetector()
	handleMessage(env, mgr, window.NewFocusMonitor(detector, func(bool) {}), detector, server.New("test"))
}

// A client always sends its whole set, so anything missing from it was deleted.
// Keeping a stale registration is not merely untidy: a registered key is a
// suppressed key, so one left behind on Ctrl+W swallows it for the session.
func TestRegisterBindsReplacesThePreviousSet(t *testing.T) {
	mgr := hk.NewManager(func(protocol.HotkeyMsg) {}, func(protocol.Bind) {})

	registerBinds(t, mgr,
		protocol.Bind{ID: "a", Key: "ctrl+w", Mode: protocol.ModeBrowserOnly, Action: "command", Command: "x"},
		protocol.Bind{ID: "b", Key: "ctrl+f9", Mode: protocol.ModeGlobal, Action: "command", Command: "y"},
	)
	ids := mgr.RegisteredIDs()
	sort.Strings(ids)
	if len(ids) != 2 || ids[0] != "a" || ids[1] != "b" {
		t.Fatalf("want both binds registered, got %v", ids)
	}

	// The user deleted "a": the next full set no longer mentions it.
	registerBinds(t, mgr,
		protocol.Bind{ID: "b", Key: "ctrl+f9", Mode: protocol.ModeGlobal, Action: "command", Command: "y"},
	)
	if ids := mgr.RegisteredIDs(); len(ids) != 1 || ids[0] != "b" {
		t.Fatalf("want only the bind still in the set, got %v", ids)
	}
}

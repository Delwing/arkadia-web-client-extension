package hotkey

import (
	"fmt"
	"log"
	"runtime"
	"sync"
	"time"

	"github.com/delwing/arkadia-web-client-extension/helper/protocol"
)

// EventCallback is called when a hotkey fires and should be forwarded.
type EventCallback func(msg protocol.HotkeyMsg)

// FocusCallback is called when a global_focus bind fires to bring browser to front.
type FocusCallback func(bind protocol.Bind)

// registration tracks one registered keybinding.
type registration struct {
	bind     protocol.Bind
	vk       KeyCode
	mods     Modifier
	remapVK  KeyCode  // target key for remap action
	remapMods Modifier // target mods for remap action
}

// Manager handles hotkey registration, mode filtering, and event dispatch.
// On Windows, it uses a low-level keyboard hook to intercept and suppress keys.
type Manager struct {
	mu                  sync.RWMutex
	registrations       map[string]*registration
	browserFocused      bool  // from window title polling
	browserFocusedHint  *bool // from web client via WS; takes precedence over polling
	callback            EventCallback
	focusCallback       FocusCallback
}

// NewManager creates a new HotkeyManager.
func NewManager(cb EventCallback, focusCb FocusCallback) *Manager {
	return &Manager{
		registrations: make(map[string]*registration),
		callback:      cb,
		focusCallback: focusCb,
	}
}

// Start installs the keyboard hook and runs the message pump.
// This blocks — call it in a goroutine. The hook requires a
// dedicated OS thread with a message pump on Windows.
func (m *Manager) Start() error {
	runtime.LockOSThread()
	err := InstallHook(func(event KeyEvent) bool {
		return m.handleKeyEvent(event)
	})
	if err != nil {
		return err
	}
	RunMessagePump()
	return nil
}

// Stop removes the keyboard hook.
func (m *Manager) Stop() {
	UninstallHook()
}

// SetBrowserFocused updates the browser focus state from window title polling.
func (m *Manager) SetBrowserFocused(focused bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.browserFocused = focused
}

// SetBrowserFocusedHint sets the focus hint from the web client.
// This takes precedence over window title polling for browser_only key filtering.
func (m *Manager) SetBrowserFocusedHint(focused bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.browserFocusedHint = &focused
}

// ClearBrowserFocusedHint removes the web client hint, falling back to window polling.
func (m *Manager) ClearBrowserFocusedHint() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.browserFocusedHint = nil
}

// Register registers a hotkey binding.
func (m *Manager) Register(bind protocol.Bind) error {
	mods, vk, err := ParseKeyCombo(bind.Key)
	if err != nil {
		return err
	}

	m.Unregister(bind.ID)

	if err := PlatformGrab(mods, vk); err != nil {
		return fmt.Errorf("grab %s: %w", bind.Key, err)
	}

	reg := &registration{bind: bind, vk: vk, mods: mods}

	m.mu.Lock()
	m.registrations[bind.ID] = reg
	m.mu.Unlock()

	log.Printf("Registered hotkey: %s (%s, mode=%s)", bind.ID, bind.Key, bind.Mode)
	return nil
}

// Unregister removes a hotkey registration.
func (m *Manager) Unregister(id string) {
	m.mu.Lock()
	reg, ok := m.registrations[id]
	if ok {
		delete(m.registrations, id)
	}
	m.mu.Unlock()

	if ok {
		PlatformUngrab(reg.mods, reg.vk)
		log.Printf("Unregistered hotkey: %s", id)
	}
}

// UnregisterAll removes all hotkey registrations.
func (m *Manager) UnregisterAll() {
	m.mu.Lock()
	regs := m.registrations
	m.registrations = make(map[string]*registration)
	m.mu.Unlock()

	for _, reg := range regs {
		PlatformUngrab(reg.mods, reg.vk)
	}
}

// CaptureNextKey sets up a one-shot capture. The next full key combo
// (press and release) will be reported via callback. Escape cancels (empty key).
func (m *Manager) CaptureNextKey(callback func(protocol.KeyCapturedMsg)) {
	SetCaptureCallback(func(event KeyEvent) {
		combo := event.ComboString()
		if event.VK == 0 {
			combo = "" // cancelled
		}
		callback(protocol.NewKeyCapturedMsg(combo))
	})
}

// handleKeyEvent is called for every keydown from the hook.
// Returns true to suppress the key from reaching other applications.
func (m *Manager) handleKeyEvent(event KeyEvent) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, reg := range m.registrations {
		if reg.vk == event.VK && reg.mods == event.Mods {
			if m.shouldFire(reg.bind) {
				if (reg.bind.Mode == protocol.ModeGlobalFocus || reg.bind.FocusBrowser) && m.focusCallback != nil {
					go m.focusCallback(reg.bind)
				}
				msg := protocol.NewHotkeyMsg(reg.bind.ID, reg.bind.Key, time.Now().UnixMilli())
				if m.callback != nil {
					go m.callback(msg)
				}
				return true // suppress the key
			}
		}
	}

	return false // don't suppress unregistered keys
}

// shouldFire determines if a hotkey event should be forwarded based on bind mode and browser focus.
func (m *Manager) shouldFire(bind protocol.Bind) bool {
	// Web client hint takes precedence over window title polling.
	focused := m.browserFocused
	if m.browserFocusedHint != nil {
		focused = *m.browserFocusedHint
	}

	switch bind.Mode {
	case protocol.ModeBrowserOnly:
		return focused
	case protocol.ModeGlobal, protocol.ModeGlobalFocus:
		return true
	default:
		return true
	}
}

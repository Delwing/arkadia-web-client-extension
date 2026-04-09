package protocol

import "encoding/json"

// Inbound message types (web app → helper)
const (
	TypeRegisterBinds      = "register_binds"
	TypeUnregisterBind     = "unregister_bind"
	TypeSetWindowMatch     = "set_window_match"
	TypeSetBrowserFocused  = "set_browser_focused"
	TypeStartCapture       = "start_capture"
	TypePing               = "ping"
)

// Outbound message types (helper → web app)
const (
	TypeHotkey      = "hotkey"
	TypeBindResult  = "bind_result"
	TypeKeyCaptured = "key_captured"
	TypePong        = "pong"
)

// BindMode determines when a hotkey is active.
type BindMode string

const (
	ModeBrowserOnly BindMode = "browser_only"
	ModeGlobal      BindMode = "global"
	ModeGlobalFocus BindMode = "global_focus"
)

// Envelope wraps every message with a type field for dispatch.
type Envelope struct {
	Type string          `json:"type"`
	Raw  json.RawMessage `json:"-"`
}

// UnmarshalJSON custom unmarshals to capture raw payload.
func (e *Envelope) UnmarshalJSON(data []byte) error {
	type plain struct {
		Type string `json:"type"`
	}
	var p plain
	if err := json.Unmarshal(data, &p); err != nil {
		return err
	}
	e.Type = p.Type
	e.Raw = data
	return nil
}

// Bind represents a single keybinding registration.
type Bind struct {
	ID           string   `json:"id"`
	Key          string   `json:"key"`
	Mode         BindMode `json:"mode"`
	Action       string   `json:"action"`            // "command" or "bind"
	Command      string   `json:"command,omitempty"`  // for action "command"
	RemapTo      string   `json:"remap_to,omitempty"` // for action "bind" — target bind name
	FocusBrowser bool     `json:"focus_browser"`
}

// RegisterBindsMsg is sent by the web app to register keybindings.
type RegisterBindsMsg struct {
	Type  string `json:"type"`
	Binds []Bind `json:"binds"`
}

// UnregisterBindMsg is sent by the web app to remove a keybinding.
type UnregisterBindMsg struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// SetWindowMatchMsg configures window title patterns for focus detection.
type SetWindowMatchMsg struct {
	Type     string   `json:"type"`
	Patterns []string `json:"patterns"`
}

// SetBrowserFocusedMsg is sent by the web app when the browser gains or loses focus.
// This overrides window title polling for browser_only hotkey filtering.
type SetBrowserFocusedMsg struct {
	Type    string `json:"type"`
	Focused bool   `json:"focused"`
}

// HotkeyMsg is sent to the web app when a registered hotkey is pressed.
type HotkeyMsg struct {
	Type      string `json:"type"`
	ID        string `json:"id"`
	Key       string `json:"key"`
	Timestamp int64  `json:"timestamp"`
}

// BindResultMsg reports success/failure of a bind registration.
type BindResultMsg struct {
	Type    string  `json:"type"`
	ID      string  `json:"id"`
	Success bool    `json:"success"`
	Error   *string `json:"error"`
}

// PongMsg is the keepalive response.
type PongMsg struct {
	Type string `json:"type"`
}

// KeyCapturedMsg is sent to the web app when a key is captured during capture mode.
type KeyCapturedMsg struct {
	Type string `json:"type"`
	Key  string `json:"key"`
}

// NewKeyCapturedMsg creates a key captured message.
func NewKeyCapturedMsg(key string) KeyCapturedMsg {
	return KeyCapturedMsg{Type: TypeKeyCaptured, Key: key}
}

// NewHotkeyMsg creates a hotkey event message.
func NewHotkeyMsg(id, key string, timestamp int64) HotkeyMsg {
	return HotkeyMsg{Type: TypeHotkey, ID: id, Key: key, Timestamp: timestamp}
}

// NewBindResultMsg creates a bind result message.
func NewBindResultMsg(id string, success bool, err error) BindResultMsg {
	msg := BindResultMsg{Type: TypeBindResult, ID: id, Success: success}
	if err != nil {
		s := err.Error()
		msg.Error = &s
	}
	return msg
}

// NewPongMsg creates a pong message.
func NewPongMsg() PongMsg {
	return PongMsg{Type: TypePong}
}

# Arkadia Helper — Design Spec

## Overview

Arkadia Helper is an optional companion Go binary that runs as a local background process, exposing an HTTP + WebSocket server on `localhost:19876`. The web app optionally connects to it for two capabilities the browser can't provide natively:

1. **Browser-intercepted shortcut forwarding** — captures keys like Ctrl+W at the OS level (before the browser sees them) when the browser window is focused, and forwards them to the web app over WebSocket.
2. **Global keybindings** — registers system-wide hotkeys (e.g. Ctrl+Q) that fire regardless of which application is focused, sending the event to the web app over WebSocket.

The helper is **fully optional** — the web app works exactly as it does today without it.

**Target platforms:** Windows, macOS, Linux (amd64 + arm64).

## Architecture

### Connection Flow

```
Web App (browser)                          Arkadia Helper (Go)
     │                                           │
     │  1. User clicks "Launch Helper"            │
     │     → opens arkadia://launch?token=XYZ     │
     │                                            │
     │                              2. OS launches helper binary
     │                                 with --token=XYZ flag
     │                                            │
     │                              3. Helper starts HTTP+WS
     │                                 on localhost:19876
     │                                            │
     │  4. Web app polls GET /status  ──────────► │
     │  ◄──────────────── { status: "ready" }     │
     │                                            │
     │  5. Web app opens WS /ws?token=XYZ ──────► │
     │  ◄──────── connection authenticated        │
     │                                            │
     │  6. Web app sends bind config ───────────► │
     │     { type: "register_binds",              │
     │       binds: [...] }                       │
     │                                            │
     │  7. Helper registers OS hotkeys            │
     │                                            │
     │  ◄─── { type: "hotkey", key: "ctrl+w" }   │
     │       (when user presses registered key)   │
```

### Single-Binary Monolith

One Go binary bundles everything: HTTP server, WebSocket server, global hotkey listener, window focus detection, and protocol handler registration. This keeps distribution simple — one binary per platform.

## HTTP Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/status` | GET | Health check. Returns `{ "status": "ready", "version": "1.0.0", "platform": "windows" }`. Web app polls this to detect if helper is running. |
| `/ws` | GET | WebSocket upgrade endpoint. Requires `?token=<TOKEN>` query param for auth. |

All real communication happens over the WebSocket.

## WebSocket Protocol

JSON-based protocol on `ws://localhost:19876/ws?token=<TOKEN>`.

### Messages: Web App → Helper

**Register/update keybindings:**
```json
{
  "type": "register_binds",
  "binds": [
    {
      "id": "attack",
      "key": "ctrl+w",
      "mode": "browser_only",
      "action": "command",
      "command": "zabij",
      "focus_browser": false
    },
    {
      "id": "support",
      "key": "ctrl+q",
      "mode": "global",
      "action": "command",
      "command": "wesprzyj",
      "focus_browser": true
    }
  ]
}
```

**Unregister a bind:**
```json
{ "type": "unregister_bind", "id": "attack" }
```

**Set window match patterns:**
```json
{
  "type": "set_window_match",
  "patterns": ["Arkadia", "arkadia.rpg.pl"]
}
```

**Ping/keepalive:**
```json
{ "type": "ping" }
```

### Messages: Helper → Web App

**Hotkey was pressed:**
```json
{
  "type": "hotkey",
  "id": "attack",
  "key": "ctrl+w",
  "timestamp": 1711446000000
}
```

**Bind registration result:**
```json
{
  "type": "bind_result",
  "id": "attack",
  "success": true,
  "error": null
}
```

**Pong:**
```json
{ "type": "pong" }
```

### Bind Modes

- **`browser_only`** — only intercepts when the browser window is focused. For capturing browser-reserved shortcuts like Ctrl+W. When the browser is not focused, the key is ignored and passed through to the OS.
- **`global`** — system-wide, fires regardless of focused window. For hotkeys that should always work.
- **`global_focus`** — system-wide, but also brings the browser window to front before sending the event. For "switch to game and do X" hotkeys.

## Custom Protocol Handler (`arkadia://`)

### Registration

On first run with `--install` flag, the helper registers itself as the OS handler for `arkadia://` URLs:

- **Windows:** Registry key `HKCU\Software\Classes\arkadia\shell\open\command`
- **macOS:** `Info.plist` in an `.app` bundle with `CFBundleURLSchemes`
- **Linux:** `.desktop` file in `~/.local/share/applications/` with `MimeType=x-scheme-handler/arkadia`

### Launch URL Format

```
arkadia://launch?token=abc123def
```

The web app generates a one-time token, constructs this URL, and presents it as a clickable link/button. When clicked:

1. OS finds the registered handler → launches the helper binary
2. Helper parses the token from the URL
3. Helper starts HTTP+WS server on `:19876`
4. Web app connects to `/ws?token=abc123def`
5. Token is validated — connection established

### Token Lifecycle

- Generated by the web app (random string, stored in memory)
- Passed once via the protocol URL
- Helper holds it in memory for the duration of its lifetime
- All WebSocket connections must present it
- No persistence — new token each time the helper is launched

## Window Focus Detection

### Per-Platform Implementation

| Platform | Detect focused window | Bring window to front |
|----------|----------------------|----------------------|
| **Windows** | `GetForegroundWindow()` + `GetWindowText()` via `user32.dll` syscalls | `SetForegroundWindow()` via `user32.dll` |
| **macOS** | `NSWorkspace.frontmostApplication` via CGo/Objective-C bridge | `NSRunningApplication.activateWithOptions` |
| **Linux** | `_NET_ACTIVE_WINDOW` property via X11 | `_NET_ACTIVE_WINDOW` set via X11 |

### Behavior

- Helper polls the focused window title every ~100ms
- Matches against configurable patterns sent by the web app via `set_window_match`
- `browser_only` binds: key is suppressed and forwarded only when browser is focused; otherwise passed through
- `global_focus` binds: hotkey event is sent over WebSocket and browser window is brought to front

### Wayland Caveat

Wayland's security model restricts focus detection on some compositors. Documented as a known limitation — degrades gracefully by treating all hotkeys as `global` mode and skipping `browser_only` filtering.

## Installation & Launch UX

### Detection States

```
1. Helper not detected    → show "Get Arkadia Helper" button
2. Helper running         → show "Connected" status + helper settings
3. Helper outdated        → show "Update available" nudge
```

The web app checks `GET localhost:19876/status` on load and periodically.

### First-Time Install Flow

1. User clicks **"Get Arkadia Helper"** in the web app
2. Modal auto-detects OS via `navigator.userAgent`/`navigator.platform`
3. Shows a **Download** button for the correct binary from GitHub Releases
4. After download, shows platform-specific instructions:
   - **Windows:** "Run `arkadia-helper.exe --install` to register the protocol handler."
   - **macOS:** "Move to Applications, run `./arkadia-helper --install` (or right-click → Open to bypass Gatekeeper on first run). The `--install` flag registers the protocol handler."
   - **Linux:** "`chmod +x ./arkadia-helper && ./arkadia-helper --install`"
5. User clicks **"Launch Helper"** → fires `arkadia://launch?token=XYZ`
6. Web app detects helper on `localhost:19876`, connects

### Auto-Launch

User toggles **"Automatically connect to Arkadia Helper"** in settings (stored in localStorage). When enabled, on page load:

1. Probe `GET localhost:19876/status`
2. If running → connect via WebSocket
3. If not running → programmatically trigger `arkadia://launch?token=XYZ`
4. Browser shows a one-time OS prompt to allow `arkadia://` links (browsers remember this choice — Chrome reliably, Firefox may re-prompt)
5. Helper starts → web app polls `/status` → connects

After first approval, the flow is fully automatic: open web app → helper launches → WebSocket connects.

### Version Check

- `/status` returns helper version
- Web app knows the expected minimum version (hardcoded or from build config)
- If outdated, shows "Update available" linking to GitHub Releases

## Project Structure

```
helper/
├── main.go                  # Entry point, flag parsing, protocol URL parsing
├── server/
│   ├── http.go              # HTTP server, /status endpoint
│   └── ws.go                # WebSocket handler, protocol message dispatch
├── hotkey/
│   ├── hotkey.go            # Cross-platform hotkey interface
│   ├── hotkey_windows.go    # Windows implementation (user32.dll)
│   ├── hotkey_darwin.go     # macOS implementation
│   └── hotkey_linux.go      # Linux/X11 implementation
├── window/
│   ├── window.go            # Cross-platform window focus interface
│   ├── window_windows.go    # GetForegroundWindow / SetForegroundWindow
│   ├── window_darwin.go     # NSWorkspace
│   └── window_linux.go      # X11 / Wayland
├── protocol/
│   ├── install.go           # Protocol handler registration interface
│   ├── install_windows.go   # Registry-based registration
│   ├── install_darwin.go    # plist / .app bundle
│   └── install_linux.go     # .desktop file
├── go.mod
└── go.sum
```

## Build & Release

- GitHub Actions workflow triggered on tags (`v*`)
- Build matrix: 6 targets (3 OS × 2 arch: amd64 + arm64)
- CGo required for macOS (hotkey/window APIs). Windows and Linux use syscalls directly.
- Artifacts uploaded as GitHub Release assets: `arkadia-helper-{os}-{arch}[.exe]`

## Web App Side Changes

- New **`HelperConnection`** module — manages detection, WebSocket connection, message dispatch
- Integrates with existing **`KeyBindingManager`** — when helper is connected, browser-intercepted keys route through it
- Settings UI — toggle auto-launch, manage helper-specific bindings, show connection status

## Key Dependencies (Go)

- WebSocket: `nhooyr.io/websocket` or `github.com/gorilla/websocket`
- Global hotkeys: `golang.design/x/hotkey`
- Platform-specific window APIs: direct syscalls / CGo

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Port 19876 conflict | Helper fails to start with clear error message. Fixed port keeps web app discovery simple. |
| OS security warnings (SmartScreen, Gatekeeper) | Documented in install instructions. Code signing can be added later. |
| Wayland focus detection | Degrade gracefully — skip `browser_only` filtering, document limitation. |
| Firefox re-prompts for protocol handler | Document as known behavior. Auto-launch still works, just requires an extra click. |
| CGo complicates cross-compilation | macOS builds run on macOS runners in CI. Windows/Linux use syscalls (no CGo needed). |
| Token replay if helper stays running | Token is single-use per helper lifetime. Restarting helper requires a new token from the web app. |

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	hk "github.com/delwing/arkadia-web-client-extension/services/helper/hotkey"
	"github.com/delwing/arkadia-web-client-extension/services/helper/protocol"
	"github.com/delwing/arkadia-web-client-extension/services/helper/server"
	"github.com/delwing/arkadia-web-client-extension/services/helper/tray"
	"github.com/delwing/arkadia-web-client-extension/services/helper/updater"
	"github.com/delwing/arkadia-web-client-extension/services/helper/window"
)

// Version is set at build time via -ldflags "-X main.Version=..."
var Version = "dev"

const DefaultPort = 19876

func main() {
	installFlag := flag.Bool("install", false, "Register arkadia:// protocol handler and exit")
	portFlag := flag.Int("port", DefaultPort, "Port to listen on")
	flag.Parse()

	launchedFromProtocol := hasProtocolArg(flag.Args())

	// Always try to register the protocol handler (idempotent)
	execPath, err := os.Executable()
	if err == nil {
		if installErr := protocol.Install(execPath); installErr != nil {
			log.Printf("Warning: failed to register protocol handler: %v", installErr)
		}
	}

	// On macOS, URL scheme launches deliver the URL via Apple Events,
	// not as a command-line argument. Detect app bundle launch instead.
	if !launchedFromProtocol && execPath != "" {
		launchedFromProtocol = isInsideAppBundle(execPath)
	}

	// First run / --install: register and exit
	if *installFlag || !launchedFromProtocol {
		fmt.Println("Protocol handler registered. You can now launch the helper from the web app.")
		os.Exit(0)
	}

	// Check if port is already in use (another helper instance running)
	if conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", *portFlag), 500*time.Millisecond); err == nil {
		conn.Close()
		log.Fatalf("Port %d is already in use. Another helper instance may be running.", *portFlag)
	}

	log.Printf("Arkadia Helper v%s starting on port %d", Version, *portFlag)

	// Create server
	srv := server.New(Version)

	// Start auto-updater. It defers restarting while the helper is busy
	// (a connected client or an active telnet/proxy bridge) so updates never
	// interrupt a live game session.
	if Version != "dev" {
		updater.Start(Version, srv.IsBusy)
	}

	// Create window focus detector and monitor
	detector := window.NewPlatformDetector()
	var focusMonitor *window.FocusMonitor

	// Create hotkey manager
	hotkeyMgr := hk.NewManager(
		func(msg protocol.HotkeyMsg) {
			srv.Note("%s pressed: fired bind %q, key swallowed", msg.Key, msg.ID)
			srv.Broadcast(msg)
		},
		func(bind protocol.Bind) {
			if focusMonitor != nil {
				focusMonitor.BringToFront(detector)
			}
		},
	)

	focusMonitor = window.NewFocusMonitor(detector, func(focused bool) {
		hotkeyMgr.SetBrowserFocused(focused)
	})
	focusMonitor.Start(100 * time.Millisecond)

	// What the status page shows beyond the server's own counters.
	srv.SetStateProvider(func() any {
		return struct {
			Hotkeys     hk.Snapshot `json:"hotkeys"`
			WindowMatch []string    `json:"window_match"`
		}{hotkeyMgr.Snapshot(), focusMonitor.Patterns()}
	})

	// Wire up message handler
	srv.SetMessageHandler(func(env protocol.Envelope) []any {
		return handleMessage(env, hotkeyMgr, focusMonitor, detector, srv)
	})

	// Clear browser focus hint when all clients disconnect (browser closed/navigated away).
	// Falls back to window title polling until a new client reconnects and sends its state.
	srv.OnDisconnectAll(func() {
		hotkeyMgr.ClearBrowserFocusedHint()
		srv.Note("No clients left: browser focus now taken from the window title")
	})

	statusURL := fmt.Sprintf("http://127.0.0.1:%d/", *portFlag)
	log.Printf("Status page: %s", statusURL)

	shutdown := func() {
		log.Println("Shutting down...")
		hotkeyMgr.Stop()
		hotkeyMgr.UnregisterAll()
		focusMonitor.Stop()
		srv.Close()
		os.Exit(0)
	}

	// Exit after 10s with no connected clients
	srv.OnIdle(10*time.Second, shutdown)

	// Run as tray app (blocks on Windows, foreground on other platforms)
	tray.Run(fmt.Sprintf("Arkadia Helper v%s", Version), tray.Callbacks{
		OnQuit: shutdown,
		OnShowStatus: func() {
			if err := openURL(statusURL); err != nil {
				log.Printf("Failed to open status page: %v", err)
			}
		},
		OnUnregister: func() {
			if err := protocol.Uninstall(); err != nil {
				log.Printf("Failed to unregister protocol handler: %v", err)
			} else {
				log.Println("Protocol handler unregistered.")
			}
		},
	}, func() {
		// Start keyboard hook
		go func() {
			if err := hotkeyMgr.Start(); err != nil {
				log.Printf("Warning: keyboard hook failed: %v", err)
			}
		}()

		// Start HTTP server
		go func() {
			if err := srv.ListenAndServe(*portFlag); err != nil {
				log.Fatalf("Server error: %v", err)
			}
		}()
	})
}

func handleMessage(env protocol.Envelope, hotkeyMgr *hk.Manager, focusMonitor *window.FocusMonitor, detector window.Detector, srv *server.Server) []any {
	var responses []any

	switch env.Type {
	case protocol.TypeRegisterBinds:
		var msg protocol.RegisterBindsMsg
		if err := json.Unmarshal(env.Raw, &msg); err != nil {
			log.Printf("invalid register_binds message: %v", err)
			return nil
		}
		// The message carries the client's whole set, so it replaces what we
		// hold. Without dropping the old registrations first, a bind the user
		// deleted stays live for the rest of the session — and a bind is a
		// *suppressed* key, so a stale one on Ctrl+W keeps swallowing it and
		// the browser tab never closes.
		hotkeyMgr.UnregisterAll()
		keys := make([]string, 0, len(msg.Binds))
		for _, bind := range msg.Binds {
			err := hotkeyMgr.Register(bind)
			responses = append(responses, protocol.NewBindResultMsg(bind.ID, err == nil, err))
			if err != nil {
				srv.Note("Bind %q (%s) rejected: %v", bind.ID, bind.Key, err)
			} else {
				keys = append(keys, bind.Key)
			}
		}
		if len(keys) == 0 {
			srv.Note("Binds replaced: none registered")
		} else {
			srv.Note("Binds replaced: %s", strings.Join(keys, ", "))
		}

	case protocol.TypeUnregisterBind:
		var msg protocol.UnregisterBindMsg
		if err := json.Unmarshal(env.Raw, &msg); err != nil {
			log.Printf("invalid unregister_bind message: %v", err)
			return nil
		}
		hotkeyMgr.Unregister(msg.ID)
		srv.Note("Bind %q removed", msg.ID)

	case protocol.TypeSetWindowMatch:
		var msg protocol.SetWindowMatchMsg
		if err := json.Unmarshal(env.Raw, &msg); err != nil {
			log.Printf("invalid set_window_match message: %v", err)
			return nil
		}
		focusMonitor.SetPatterns(msg.Patterns)
		log.Printf("Window match patterns updated: %v", msg.Patterns)

	case protocol.TypeSetBrowserFocused:
		var msg protocol.SetBrowserFocusedMsg
		if err := json.Unmarshal(env.Raw, &msg); err != nil {
			log.Printf("invalid set_browser_focused message: %v", err)
			return nil
		}
		prev := hotkeyMgr.Snapshot().FocusHint
		hotkeyMgr.SetBrowserFocusedHint(msg.Focused)
		log.Printf("Browser focus hint: %v", msg.Focused)
		if prev != nil && *prev == msg.Focused {
			// unchanged — keep the activity log readable
		} else if msg.Focused {
			srv.Note("Client says it has focus: browser-only binds now swallow their keys")
		} else {
			srv.Note("Client says it lost focus: browser-only binds let keys through")
		}

	case protocol.TypeStartCapture:
		log.Println("Starting key capture...")
		srv.Note("Capturing the next key press for the bind editor")
		go hotkeyMgr.CaptureNextKey(func(msg protocol.KeyCapturedMsg) {
			log.Printf("Captured key: %s", msg.Key)
			srv.Broadcast(msg)
		})
	}

	return responses
}

// openURL opens a URL in the default browser.
func openURL(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		// url.dll takes the URL as one argument, so no cmd.exe quoting is involved.
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}

func hasProtocolArg(args []string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, "arkadia://") {
			return true
		}
	}
	return false
}

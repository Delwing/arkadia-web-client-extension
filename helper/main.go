package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"strings"
	"time"

	hk "github.com/delwing/arkadia-web-client-extension/helper/hotkey"
	"github.com/delwing/arkadia-web-client-extension/helper/protocol"
	"github.com/delwing/arkadia-web-client-extension/helper/server"
	"github.com/delwing/arkadia-web-client-extension/helper/tray"
	"github.com/delwing/arkadia-web-client-extension/helper/updater"
	"github.com/delwing/arkadia-web-client-extension/helper/window"
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

	// Start auto-updater
	if Version != "dev" {
		updater.Start(Version)
	}

	// Create server
	srv := server.New(Version)

	// Create window focus detector and monitor
	detector := window.NewPlatformDetector()
	var focusMonitor *window.FocusMonitor

	// Create hotkey manager
	hotkeyMgr := hk.NewManager(
		func(msg protocol.HotkeyMsg) {
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

	// Wire up message handler
	srv.SetMessageHandler(func(env protocol.Envelope) []any {
		return handleMessage(env, hotkeyMgr, focusMonitor, detector, srv)
	})

	// Clear browser focus hint when all clients disconnect (browser closed/navigated away).
	// Falls back to window title polling until a new client reconnects and sends its state.
	srv.OnDisconnectAll(func() {
		hotkeyMgr.ClearBrowserFocusedHint()
	})

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
		for _, bind := range msg.Binds {
			err := hotkeyMgr.Register(bind)
			responses = append(responses, protocol.NewBindResultMsg(bind.ID, err == nil, err))
		}

	case protocol.TypeUnregisterBind:
		var msg protocol.UnregisterBindMsg
		if err := json.Unmarshal(env.Raw, &msg); err != nil {
			log.Printf("invalid unregister_bind message: %v", err)
			return nil
		}
		hotkeyMgr.Unregister(msg.ID)

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
		hotkeyMgr.SetBrowserFocusedHint(msg.Focused)
		log.Printf("Browser focus hint: %v", msg.Focused)

	case protocol.TypeStartCapture:
		log.Println("Starting key capture...")
		go hotkeyMgr.CaptureNextKey(func(msg protocol.KeyCapturedMsg) {
			log.Printf("Captured key: %s", msg.Key)
			srv.Broadcast(msg)
		})
	}

	return responses
}

func hasProtocolArg(args []string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, "arkadia://") {
			return true
		}
	}
	return false
}

package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"runtime"
	"sync"
	"time"

	"github.com/delwing/arkadia-web-client-extension/helper/protocol"
)

// StatusResponse is returned by GET /status.
type StatusResponse struct {
	Status   string `json:"status"`
	Version  string `json:"version"`
	Platform string `json:"platform"`
}

// MessageHandler processes an inbound WebSocket message and returns optional responses.
type MessageHandler func(msg protocol.Envelope) []any

// Server holds the HTTP + WebSocket server state.
type Server struct {
	version          string
	mux              *http.ServeMux
	listener         net.Listener
	handler          MessageHandler
	clientsMu        sync.RWMutex
	clients          []*wsConn
	onIdle           func()
	onDisconnectAll  func()
	idleTimer        *time.Timer
	idleMu           sync.Mutex
}

// OnDisconnectAll sets a callback called immediately when the last client disconnects.
func (s *Server) OnDisconnectAll(cb func()) {
	s.onDisconnectAll = cb
}

// OnIdle sets a callback called when no clients are connected for the given duration.
func (s *Server) OnIdle(d time.Duration, cb func()) {
	s.onIdle = cb
	// Start the idle timer immediately (no clients connected yet)
	s.idleTimer = time.AfterFunc(d, cb)
}

func (s *Server) resetIdleTimer(d time.Duration) {
	s.idleMu.Lock()
	defer s.idleMu.Unlock()
	if s.idleTimer != nil {
		s.idleTimer.Stop()
	}
	if s.onIdle != nil {
		log.Printf("Starting idle timer (%v)", d)
		s.idleTimer = time.AfterFunc(d, func() {
			log.Println("Idle timeout reached")
			s.onIdle()
		})
	}
}

// New creates a new Server.
func New(version string) *Server {
	s := &Server{
		version: version,
		mux:     http.NewServeMux(),
	}
	s.mux.HandleFunc("GET /status", s.handleStatus)
	s.mux.HandleFunc("GET /ws", s.handleWS)
	return s
}

// ListenAndServe starts the HTTP server on the given port.
func (s *Server) ListenAndServe(port int) error {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}
	s.listener = ln
	log.Printf("Listening on %s", addr)
	return http.Serve(ln, s.corsMiddleware(s.mux))
}

// Close stops the server.
func (s *Server) Close() error {
	if s.listener != nil {
		return s.listener.Close()
	}
	return nil
}

// Broadcast sends a message to all connected clients.
func (s *Server) Broadcast(msg any) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	for _, c := range s.clients {
		if err := c.Send(msg); err != nil {
			log.Printf("broadcast error: %v", err)
		}
	}
}

// SetMessageHandler sets the handler for inbound messages.
func (s *Server) SetMessageHandler(h MessageHandler) {
	s.handler = h
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	resp := StatusResponse{
		Status:   "ready",
		Version:  s.version,
		Platform: runtime.GOOS,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

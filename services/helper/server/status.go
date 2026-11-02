package server

import (
	_ "embed"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

//go:embed status.html
var statusPage []byte

// StatusDetail is returned by GET /status/detail: everything the status page
// shows. Unlike /status it is not readable cross-origin — it carries bind
// commands and the client's tab title — so only the helper's own page reads it.
type StatusDetail struct {
	StatusResponse
	PID           int             `json:"pid"`
	Executable    string          `json:"executable"`
	Started       int64           `json:"started"` // unix millis
	Clients       int             `json:"clients"`
	TelnetBridges int             `json:"telnet_bridges"`
	Warnings      []string        `json:"warnings"`
	State         any             `json:"state,omitempty"`
	Activity      []ActivityEntry `json:"activity"`
}

// SetStateProvider sets the function whose result fills StatusDetail.State
// (hotkeys, focus, window patterns — things the server package doesn't own).
func (s *Server) SetStateProvider(fn func() any) {
	s.stateProvider = fn
}

// privatePaths are served without CORS headers, so a web page on another
// origin can't read them. The status page itself is same-origin.
func isPrivatePath(path string) bool {
	return path == "/" || path == "/status/detail"
}

// isLocalHost guards the private paths against DNS rebinding: a page whose
// own hostname has been pointed at 127.0.0.1 would count as same-origin, but
// its Host header still names that hostname.
func isLocalHost(host string) bool {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	return host == "127.0.0.1" || host == "localhost" || host == "::1"
}

func (s *Server) handleStatusPage(w http.ResponseWriter, r *http.Request) {
	if !isLocalHost(r.Host) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Write(statusPage)
}

func (s *Server) handleStatusDetail(w http.ResponseWriter, r *http.Request) {
	if !isLocalHost(r.Host) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	s.clientsMu.RLock()
	clients, telnet := len(s.clients), s.telnetCount
	s.clientsMu.RUnlock()

	exe, _ := os.Executable()
	d := StatusDetail{
		StatusResponse: StatusResponse{Status: "ready", Version: s.version, Platform: runtime.GOOS},
		PID:            os.Getpid(),
		Executable:     exe,
		Started:        s.started.UnixMilli(),
		Clients:        clients,
		TelnetBridges:  telnet,
		Warnings:       buildWarnings(s.version, exe),
		Activity:       s.activity.snapshot(),
	}
	if s.stateProvider != nil {
		d.State = s.stateProvider()
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(d)
}

// buildWarnings flags a helper that isn't the installed release — the kind of
// leftover that keeps running old code because it never auto-updates.
func buildWarnings(version, exe string) []string {
	var out []string
	if version == "dev" {
		out = append(out, "Development build: auto-update is off, so this copy never gets fixes.")
	}
	if exe != "" && isUnderTemp(exe) {
		out = append(out, "Running from a temporary folder: the arkadia:// handler may point at a leftover copy.")
	}
	return out
}

func isUnderTemp(exe string) bool {
	tmp := os.TempDir()
	if tmp == "" {
		return false
	}
	tmp, exe = filepath.Clean(tmp), filepath.Clean(exe)
	if runtime.GOOS == "windows" {
		tmp, exe = strings.ToLower(tmp), strings.ToLower(exe)
	}
	rel, err := filepath.Rel(tmp, exe)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

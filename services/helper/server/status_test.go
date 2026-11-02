package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func get(t *testing.T, h http.Handler, path, host string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Host = host
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestStatusStaysPublic(t *testing.T) {
	s := New("1.2.3")
	rec := get(t, s.corsMiddleware(s.mux), "/status", "127.0.0.1:19876")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatal("/status lost its CORS header; the client's probe needs it")
	}
	var body map[string]any
	json.Unmarshal(rec.Body.Bytes(), &body)
	if _, leaked := body["state"]; leaked {
		t.Fatal("/status must not carry the detail state")
	}
}

func TestStatusDetailIsPrivate(t *testing.T) {
	s := New("1.2.3")
	s.SetStateProvider(func() any { return map[string]string{"secret": "kill troll"} })
	s.Note("Client connected")
	h := s.corsMiddleware(s.mux)

	for _, path := range []string{"/", "/status/detail"} {
		rec := get(t, h, path, "localhost:19876")
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: status %d", path, rec.Code)
		}
		if rec.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("%s must not be readable cross-origin", path)
		}
		// A rebound hostname resolves to us but keeps its own Host header.
		if rec := get(t, h, path, "evil.example:19876"); rec.Code != http.StatusForbidden {
			t.Fatalf("%s served to a foreign Host: %d", path, rec.Code)
		}
	}

	var d StatusDetail
	if err := json.Unmarshal(get(t, h, "/status/detail", "127.0.0.1:19876").Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	if d.Version != "1.2.3" || d.PID == 0 || len(d.Activity) != 1 || d.Activity[0].Text != "Client connected" {
		t.Fatalf("unexpected detail: %+v", d)
	}
	if !strings.Contains(string(mustJSON(t, d.State)), "kill troll") {
		t.Fatal("state provider result missing")
	}
}

func TestActivityIsCapped(t *testing.T) {
	var a activityLog
	for i := 0; i < activityLimit+25; i++ {
		a.add("x")
	}
	if n := len(a.snapshot()); n != activityLimit {
		t.Fatalf("kept %d entries", n)
	}
}

func TestBuildWarnings(t *testing.T) {
	inTemp := filepath.Join(os.TempDir(), "claude", "scratchpad", "arkadia-helper.exe")
	if w := buildWarnings("dev", inTemp); len(w) != 2 {
		t.Fatalf("leftover dev copy in temp should warn twice, got %v", w)
	}
	if w := buildWarnings("1.4.0", filepath.Join(filepath.Dir(os.TempDir()), "Programs", "arkadia-helper.exe")); len(w) != 0 {
		t.Fatalf("installed release should not warn, got %v", w)
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

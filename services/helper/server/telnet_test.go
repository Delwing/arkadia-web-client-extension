package server

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// wsURL turns an httptest http(s) base URL into a ws(s) telnet endpoint URL.
func wsURL(base, query string) string {
	return "ws" + strings.TrimPrefix(base, "http") + "/telnet" + query
}

func TestTelnetRejectsDisallowedHost(t *testing.T) {
	s := New("test")
	ts := httptest.NewServer(s.corsMiddleware(s.mux))
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, resp, err := websocket.Dial(ctx, wsURL(ts.URL, "?host=evil.example.com&port=23"), nil)
	if conn != nil {
		conn.CloseNow()
	}
	if err == nil {
		t.Fatal("expected dial to fail for a disallowed host")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden, got resp=%v err=%v", resp, err)
	}
}

func TestTelnetBridgesData(t *testing.T) {
	// Local TCP echo server stands in for the MUD.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		io.Copy(c, c) // echo back everything
	}()

	// Point the allowlist at the loopback echo server for this test.
	prev := allowedTelnetHost
	allowedTelnetHost = "127.0.0.1"
	defer func() { allowedTelnetHost = prev }()

	_, port, err := net.SplitHostPort(ln.Addr().String())
	if err != nil {
		t.Fatalf("split host port: %v", err)
	}

	s := New("test")
	ts := httptest.NewServer(s.corsMiddleware(s.mux))
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL(ts.URL, "?host=127.0.0.1&port="+port), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.CloseNow()

	want := []byte("hello telnet")
	if err := conn.Write(ctx, websocket.MessageBinary, want); err != nil {
		t.Fatalf("write: %v", err)
	}

	typ, got, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if typ != websocket.MessageBinary {
		t.Fatalf("expected a binary frame, got %v", typ)
	}
	if string(got) != string(want) {
		t.Fatalf("echo mismatch: got %q want %q", got, want)
	}
}

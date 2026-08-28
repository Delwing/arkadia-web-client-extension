package main

import (
	"net/http"
	"testing"
)

func requestWithProtocols(values ...string) *http.Request {
	r, _ := http.NewRequest(http.MethodGet, "/attach", nil)
	for _, v := range values {
		r.Header.Add("Sec-WebSocket-Protocol", v)
	}
	return r
}

func TestReadsSessionIdFromSubprotocols(t *testing.T) {
	r := requestWithProtocols("arkadia-session-v1, s.0123456789abcdef0123456789abcdef")

	if got := sessionFromSubprotocols(r); got != "0123456789abcdef0123456789abcdef" {
		t.Fatalf("got %q", got)
	}
}

// Browsers send one header; other clients may split them. Both are legal.
func TestReadsSessionIdFromSeparateHeaders(t *testing.T) {
	r := requestWithProtocols("arkadia-session-v1", "s.0123456789abcdef0123456789abcdef")

	if got := sessionFromSubprotocols(r); got != "0123456789abcdef0123456789abcdef" {
		t.Fatalf("got %q", got)
	}
}

// A client that only wants raw bytes still has to say which session it is claiming.
func TestReadsSessionIdWithoutTheVersionedProtocol(t *testing.T) {
	r := requestWithProtocols("s.0123456789abcdef0123456789abcdef")

	if got := sessionFromSubprotocols(r); got != "0123456789abcdef0123456789abcdef" {
		t.Fatalf("got %q", got)
	}
}

func TestNoSessionIdWhenAbsent(t *testing.T) {
	for _, header := range []string{"", "arkadia-session-v1", "chat, superchat"} {
		r := requestWithProtocols(header)
		if got := sessionFromSubprotocols(r); got != "" {
			t.Fatalf("header %q yielded %q, want none", header, got)
		}
	}
}

// The id used to travel in the query string. It must not be honoured there any more, or
// the credential is back in every access log by the first client that sends it.
func TestQueryStringSessionIsIgnored(t *testing.T) {
	r, _ := http.NewRequest(http.MethodGet, "/attach?session=0123456789abcdef0123456789abcdef", nil)

	if got := sessionFromSubprotocols(r); got != "" {
		t.Fatalf("query string still accepted: %q", got)
	}
}

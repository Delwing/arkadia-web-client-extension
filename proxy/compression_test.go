package main

import "testing"

/*
Compression is declined for WebKit's socket stack: since Safari 15 it offers
permessage-deflate but implements it incorrectly, and negotiating it drops the
connection within moments — on every browser on iOS, not just Safari, since they all
wrap WebKit. Getting the sniff wrong in either direction matters: missing a WebKit
client reintroduces the instant-reconnect loop, while catching Chrome or Firefox by
mistake silently costs them a working compressed hop.
*/
func TestWebkitSocketDetection(t *testing.T) {
	cases := []struct {
		name   string
		ua     string
		webkit bool
	}{
		{
			name:   "iPhone Safari",
			ua:     "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
			webkit: true,
		},
		{
			// An iPad in its default desktop mode does not say "iPad" at all — it
			// masquerades as macOS Safari, and has to be caught by that branch.
			name:   "iPad desktop mode",
			ua:     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
			webkit: true,
		},
		{
			name:   "macOS Safari",
			ua:     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
			webkit: true,
		},
		{
			name:   "Chrome on iOS",
			ua:     "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.51 Mobile/15E148 Safari/604.1",
			webkit: true,
		},
		{
			name:   "Firefox on iOS",
			ua:     "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15",
			webkit: true,
		},
		{
			// "EdgiOS" contains "Edg", so it must be recognised as iOS before the
			// desktop-engine exclusions get a look at it.
			name:   "Edge on iOS",
			ua:     "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/125.0.2535.60 Version/17.0 Mobile/15E148 Safari/604.1",
			webkit: true,
		},
		{
			name:   "Chrome on Windows",
			ua:     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
			webkit: false,
		},
		{
			name:   "Edge on Windows",
			ua:     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.51",
			webkit: false,
		},
		{
			name:   "Firefox on Linux",
			ua:     "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
			webkit: false,
		},
		{
			name:   "Chrome on Android",
			ua:     "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.52 Mobile Safari/537.36",
			webkit: false,
		},
		{
			// `wscat` and other hand-driven clients send no user agent; they get the
			// default, working negotiation.
			name:   "no user agent",
			ua:     "",
			webkit: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := webkitSocket(tc.ua); got != tc.webkit {
				t.Fatalf("webkitSocket(%q) = %v, want %v", tc.ua, got, tc.webkit)
			}
		})
	}
}

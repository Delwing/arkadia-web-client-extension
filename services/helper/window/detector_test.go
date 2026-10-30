package window

import "testing"

func TestPickWindowPrefersEarlierPattern(t *testing.T) {
	// What a developer's machine really looks like: an editor and a chat window
	// both carry the game's name, and only the tab title names the client.
	windows := []WindowMatch{
		{Handle: 1, Title: "arkadia-mc – loot.lua"},
		{Handle: 2, Title: "#general | arkadia-skrypty-mudlet - Discord"},
		{Handle: 3, Title: "ㅤ Arkadia - Brave"},
	}
	patterns := []string{"ㅤ Arkadia", "Arkadia", "arkadia.rpg.pl"}

	match, ok := PickWindow(windows, patterns)
	if !ok || match.Handle != 3 {
		t.Fatalf("want the client's own window (3), got %v (ok=%v)", match.Handle, ok)
	}
}

func TestPickWindowFallsBackToLaterPatterns(t *testing.T) {
	windows := []WindowMatch{{Handle: 7, Title: "Arkadia - Chrome"}}

	match, ok := PickWindow(windows, []string{"⚔ Arkadia [5/7]", "Arkadia"})
	if !ok || match.Handle != 7 {
		t.Fatalf("want the fallback match (7), got %v (ok=%v)", match.Handle, ok)
	}
}

func TestPickWindowMatchesCaseInsensitively(t *testing.T) {
	windows := []WindowMatch{{Handle: 1, Title: "Gra na ARKADIA.RPG.PL"}}

	if _, ok := PickWindow(windows, []string{"arkadia.rpg.pl"}); !ok {
		t.Fatal("want a case-insensitive match")
	}
}

func TestPickWindowIgnoresEmptyTitlesAndPatterns(t *testing.T) {
	windows := []WindowMatch{{Handle: 1, Title: ""}}

	if _, ok := PickWindow(windows, []string{"", "Arkadia"}); ok {
		t.Fatal("an untitled window must never be raised")
	}
}

func TestPickWindowReportsNoMatch(t *testing.T) {
	windows := []WindowMatch{{Handle: 1, Title: "Inbox - Mail"}}

	if _, ok := PickWindow(windows, []string{"Arkadia"}); ok {
		t.Fatal("want no match")
	}
}

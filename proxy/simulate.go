package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// Manufacturing an absence, so a replay can be watched in the real client rather than
// inferred from a harness.
//
// A test rig cannot answer whether a returning player's phone stutters: the interesting
// costs are the trigger pipeline, layout and paint, none of which a jsdom test performs.
// This pushes synthetic output into a session's buffer exactly as the game would, so
// reattaching plays it back through the whole client for real.
//
// Timestamps are spread across the requested span rather than set to now, which also
// exercises the event clock: a combat timer stamped from a line dated twelve minutes ago
// should come back already expired.

const (
	telnetIAC  = 255
	telnetSB   = 250
	telnetSE   = 240
	telnetGMCP = 201
)

// gmcpFrame wraps a GMCP payload in the telnet subnegotiation the client expects.
func gmcpFrame(path, json string) []byte {
	frame := []byte{telnetIAC, telnetSB, telnetGMCP}
	frame = append(frame, []byte(path+" "+json)...)
	return append(frame, telnetIAC, telnetSE)
}

// gameText is how Arkadia delivers a line: base64 inside a gmcp_msgs envelope.
func gameText(line string) []byte {
	encoded := base64.StdEncoding.EncodeToString([]byte(line + "\n"))
	return gmcpFrame("gmcp_msgs", fmt.Sprintf(`{"type":"text","text":%q}`, encoded))
}

/*
charState is the vitals message Arkadia actually sends.

Not `char.vitals` with hit points: the path is `char.state` and every value is a small
ordinal — hp indexes a condition list running 0 ("ledwo zywy") to 6 ("w swietnej
kondycji"), which is why hpAlert increments before looking the name up. Absolute
hit-point numbers would sail past every script that reads them, which is exactly what
happened on the first run of this.
*/
func charState(hp, fatigue, improve int) []byte {
	return gmcpFrame("char.state", fmt.Sprintf(
		`{"hp":%d,"mana":5,"fatigue":%d,"improve":%d,"stuffed":3,"soaked":2,"encumbrance":1}`,
		hp, fatigue, improve))
}

// A fight's worth of condition: healthy, worn down towards the alert threshold, then
// recovering. Scripts that watch for a drop, for full health, or for improve ticks all
// have something to react to.
func hpCurve(i int) (hp, fatigue int) {
	cycle := []int{6, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6}
	hp = cycle[(i/7)%len(cycle)]
	fatigue = cycle[(i/11)%len(cycle)]
	return hp, fatigue
}

/*
loadSampleLines replaces the built-in lines with real ones, given a JSON array of
strings — a session log run through the extractor.

Worth the flag: invented lines do not match the client's triggers, so a simulated
absence built from them measures parsing and rendering while skipping the trigger
pipeline, which is most of the work. The first run of this proved the point by firing
nothing at all.
*/
func loadSampleLines(path string) (int, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	var lines []string
	if err := json.Unmarshal(raw, &lines); err != nil {
		return 0, err
	}
	if len(lines) == 0 {
		return 0, fmt.Errorf("no lines in %s", path)
	}
	sampleLines = lines
	return len(lines), nil
}

// Fallback when no real log is supplied. Shaped like a busy fight, but invented, so it
// exercises the transport rather than the triggers.
var sampleLines = []string{
	"Kostur uderza cie potwornie silnie w tors, ale nie robi ci to wiekszej krzywdy.",
	"Trafiasz Kostura bardzo silnie w glowe, ranisz go powaznie.",
	"Kostur probuje cie trafic, ale unikasz ciosu.",
	"Zolnierz mowi: Nie przejdziesz tedy, obcy.",
	"Ktos powiedzial na kanale handel: Sprzedam miecz, tanio.",
	"Twoja rana na tulowiu zaczyna sie zablizniac.",
	"Kostur pada na ziemie martwy.",
	"Widzisz tu: kamien, galaz, zwloki Kostura.",
	"Idziesz na polnoc.",
	"Czujesz sie zmeczony.",
}

/*
simulate pushes `lines` lines of synthetic output into the session, dated across the last
`span`, as though the player had been away that long.

Returns the raw bytes produced, which is the number the buffer is sized against.
*/
func (s *Session) simulate(lines int, span time.Duration) int {
	now := time.Now()
	total := 0
	for i := 0; i < lines; i++ {
		// Oldest first, so overflow drops the front exactly as a real absence would.
		age := time.Duration(float64(span) * float64(lines-i) / float64(lines))
		at := now.Add(-age)

		// Verbatim, with no counter appended: most trigger patterns are anchored at the
		// end of the line, so decorating it stops every one of them matching.
		text := gameText(sampleLines[i%len(sampleLines)])
		s.deliver(chunk{at: at, bytes: text})
		total += len(text)

		if i%3 == 0 {
			hp, fatigue := hpCurve(i)
			v := charState(hp, fatigue, i/40)
			s.deliver(chunk{at: at, bytes: v})
			total += len(v)
		}
	}
	return total
}

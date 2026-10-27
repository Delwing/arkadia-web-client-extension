# Line-processing and rendering performance

Dev-facing. How to measure what one line of game output costs, what the first
measurement found, and where the remaining time goes.

## Measuring

```bash
yarn perf
```

Builds the client unminified (so profiles name real functions), boots it against
the e2e mocks and streams game lines into it through the mock socket. Two
scenarios:

- **steady** - 4000 lines, 10 per animation frame (a busy fight).
- **burst** - 4000 lines, 200 per message (login, a long listing).

For each it prints the synchronous cost per line, frame times, Chromium's
main-thread totals (busy time, async script, layout, style) and the functions with
the most self time. The full CPU profile is written to `perf-results/*.cpuprofile`;
load it in DevTools (Performance panel, "Load profile") to follow a hotspot.

If the browser build that `@playwright/test` expects is not installed, point the
run at any Chromium: `PERF_CHROMIUM=/path/to/chrome yarn perf`.

Only compare numbers taken on the same machine - run the base branch and yours
back to back. The corpus (`e2e/perf/corpus.txt`) is game lines lifted from the
tests, so it leans towards lines that some trigger reacts to: a pessimistic mix.

The harness drives the app through the mock server only. The "busy" figure counts
everything the lines set off, including React work in popups and dialogs that are
not on screen - which is where the biggest wins were.

## First pass (fixed)

Measured in a cloud container, steady scenario:

| | before | after |
|---|---|---|
| main thread busy | 8.2-9.7 s | 5.2 s |
| async script (timers, React) | 2.9-3.8 s | 0.3 s |
| sync cost per line | 570-620 us | ~470 us |
| frame p95 | 32-61 ms | 18 ms |

- **Settings dialog re-rendering while closed.** `LocalExportTab` refreshed its
  character list on every storage write - and the game writes storage constantly -
  always setting fresh state, which re-rendered it and, via `onSelectionChange`,
  its parent. ~20% of all main-thread time. It now re-renders only when the roster
  actually changes.
- **`CoverDebugPopup` rendering while closed.** Popups in `popupCatalog` stay
  mounted for the session. This one re-rendered its 200-row log on every cover
  event and on a 500 ms interval, whether open or not. Now it ticks only while
  open and builds its body only while open.
- **`toLocaleTimeString` / `toLocaleString` on hot paths.** Each call builds a new
  `Intl.DateTimeFormat` (~55 us). The cover log, the chat history and the output
  timestamp tooltip (every line) now reuse one formatter (<1 us).
- **Trigger loop allocations.** `Trigger.execute` allocated two arrays for
  `stayOpenLines` bookkeeping and one to wrap the pattern, per trigger per line -
  ~3800 throwaway arrays per line. It now allocates nothing when idle.

A rule of thumb that came out of this: anything mounted for the whole session
(popups in `popupCatalog`, the settings dialog, footer chips) must not do work
proportional to game output while it is not visible.

## Remaining opportunities (not done)

- **The trigger pass itself (~110 us/line).** About 1260 top-level triggers run
  against every line; every regex is tried in turn. The largest single tree is
  `luaGags` (`gags_lua.json`): ~100 patterns on every non-combat line and ~700 on
  a combat line, because its top nodes have no pattern and match everything. Ideas,
  roughly by payoff:
  - Gate subtrees by line type before testing patterns (most gag trees only apply
    to `combat.*` lines).
  - Pre-filter each regex by a literal it requires (`"rzuca sie na"`), checked with
    `indexOf` or against the token index `registerTokenTrigger` already keeps.
  - Prefer anchored patterns: leading `.*` / `(^[ >]*.* ...)` forms backtrack over
    the whole line on every miss.
- **Session logger:** one IndexedDB transaction per output line
  (`sessionLogger.ts`). Batching per frame would cut ~25 us/line.
- **Output timestamps:** every line builds timestamp and message-type spans that are
  hidden unless the toggles are on.
- **Bursts block the main thread:** a 200-line message is processed synchronously
  (~90-110 ms here). Chunking the trigger pass across frames would keep input responsive
  during login dumps, at the cost of ordering complexity.

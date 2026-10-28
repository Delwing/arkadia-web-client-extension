# Line-processing and rendering performance

Dev-facing. How to measure what one line of game output costs, and where the time
goes.

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

The "busy" figure counts everything the lines set off, including React work in
popups that are not on screen - which is where the biggest win so far was.

## Rule of thumb

Anything mounted for the whole session - popups in `popupCatalog`, dialogs, footer
chips - must not do work proportional to game output while it is not visible.
`CoverDebugPopup` did: closed, it re-rendered its 200-row log on every cover event
and every 500 ms, formatting each row's time with `toLocaleTimeString` (which builds
a new `Intl.DateTimeFormat` per call, ~55 us). That was over a third of all
main-thread time while text streamed in.

Likewise, keep `toLocale*String` off hot paths; reuse one `Intl.DateTimeFormat`.

## Remaining opportunities

- **The trigger pass.** About 1260 top-level triggers see every line. The largest
  single tree is `luaGags` (`gags_lua.json`): ~100 patterns on every non-combat
  line and ~700 on a combat line, because its top nodes have no pattern and match
  everything. Gating its subtrees by line type (most only apply to `combat.*`)
  would cut most of that.
- **Session logger:** one IndexedDB transaction per output line
  (`sessionLogger.ts`). Batching per frame would save ~25 us/line.
- **Bursts block the main thread:** a 200-line message is processed synchronously
  (~80-100 ms here). Chunking the trigger pass across frames would keep input
  responsive during login dumps, at the cost of ordering complexity.

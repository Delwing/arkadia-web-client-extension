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

## The trigger pass

About 1300 top-level triggers see every line, and the pass is most of the line
processing (~90% of it in the burst profile). Trigger order is part of the
behaviour, so everything here keeps it. What helps is not visiting what cannot
match:

- The literal prefilter (`triggerPrefilter.ts`) skips a regex whose required text
  is not in the line. It also understands alternations and mandatory groups
  (`^(?:one phrase|another)`, `(^[ >]*... text ...)`), so every Mudlet gag regex
  has one - no change to the imported regexes was needed.
- `Triggers.parseLine` asks `Trigger.cannotMatch` before `execute`, so a ruled-out
  trigger costs one prefilter check instead of a full call.

Together ~17% off the per-line cost against the plain prefilter.

Small effects like these drown in the noise of `yarn perf` (10-15% run to run on a
shared machine). Compare variants in one Node process instead - the real client
with `registerScripts`, `client.onLine` over the corpus, variants alternated over
many rounds, minimum taken - which resolves a few percent.

Tried and dropped, measured that way:

- **An Aho-Corasick scan** of each line for every literal at once. On ~70-character
  lines V8's `String.includes` is so fast that ~1200 of them cost less than the scan.
- **Caching each trigger's prefilter on the trigger** instead of the WeakMap: no
  measurable difference.

## Rendering

Per frame of streamed text, the browser's own work (style, layout, pre-paint, paint,
commit) costs more than processing the lines. Only ~10% of the layouts are forced
from script (the footer `StatusLine` measuring its chips, the scroll handler reading
sizes); the rest is the normal per-frame work for a ~1000-message scrollback.
`content-visibility: auto` on output messages made it worse: layout and pre-paint
grew more than paint shrank.

## Output DOM

The stock output wrapper builds a line's timestamp and message-type spans only while
their toggle is on, and fills them into the lines on screen when it is switched on.
Hidden, they were ~23% of the output's DOM nodes; dropping them took ~7% off the
per-line cost and ~5% off main-thread time in the steady scenario (averaged over
five `yarn perf` pairs).

## Remaining opportunities

- **Session logger:** one IndexedDB transaction per output line
  (`sessionLogger.ts`). Not worth batching: with logging switched off entirely,
  main-thread time drops by at most ~4% (steady) and not measurably in a burst, and
  batching would only remove part of that.
- **Bursts block the main thread:** a 200-line message is processed synchronously
  (~60-80 ms here). Chunking the trigger pass across frames would keep input
  responsive during login dumps, at the cost of ordering complexity.

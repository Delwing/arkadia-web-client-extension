# Measuring line-processing performance

Dev-facing. How to measure what one line of game output costs, and where the time
goes.

## `yarn perf`

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
popups that are not on screen.

## Small effects: compare in one Node process

`yarn perf` varies 10-15% run to run on a shared machine, so effects of a few
percent drown in it. Compare variants in one Node process instead - the real client
with `registerScripts`, `client.onLine` over the corpus, variants alternated over
many rounds, minimum taken - which resolves a few percent.

## Reference numbers

Measured on one machine; use them for orders of magnitude, not as a baseline.

- About 1300 top-level triggers see every line; the trigger pass is ~90% of line
  processing in the burst profile.
- A 200-line burst is processed synchronously in ~60-80 ms.
- Per frame of streamed text, the browser's own work (style, layout, paint) costs
  more than processing the lines; only ~10% of layouts are forced from script.
- `toLocaleTimeString` builds a new `Intl.DateTimeFormat` per call, ~55 us - keep
  `toLocale*String` off hot paths and reuse one formatter.
- With session logging switched off entirely, main-thread time drops by at most ~4%
  (steady) and not measurably in a burst.

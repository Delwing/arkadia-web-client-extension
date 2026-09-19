# Log viewer

The reference screen for the design system: a session log browser with
time-based navigation, search across one log or all of them, and channel
filters. It lives in `src/ui/logViewer` (`@ui/logViewer`) and is mounted by the
standalone page in `log-viewer/`.

It is host-agnostic on purpose — it renders into whatever box it is given, so
the same component can become a modal inside the client without a rewrite.

---

## 1. Data

```ts
interface LogLine  { number; timestamp; channel; text; html?; event? }
interface LogSession { id; character; dayLabel; dateLabel; startedAt; endedAt;
                       live; file; lines }
```

The viewer never touches IndexedDB. `log-viewer/sessionAdapter.ts` is the only
module that knows about stores, `session_<ms>` names and stored record shapes;
the showcase drives the same component from generated mock data.

### Channels come from the parser layer, not from the view

Arkadia tags every line with a GMCP message type as it arrives (`comm`,
`combat.avatar`, `room.long`, `system.login`, …); `sessionLogger` already stores
that type with the line. `model/channels.ts` folds those ~25 types into six
buckets:

| Channel | GMCP types |
|---|---|
| `comm` — Rozmowy | `comm`, `emotes` |
| `combat` — Walka | `combat.*`, `room.combat` |
| `room` — Lokacja | `room.*`, `living.long`, `object.long` |
| `system` — System | `system`, `system.login`, `prompt`, `other`, unknown |
| `notify` — Powiadomienia | `notification.*`, `mail`, `editor*` |
| `command` — Komendy | `command` (the echoed player input) |

Prefixes match longest-first, so `room.combat` lands in combat rather than
scenery. Because classification happens at write time, filters work on every log
already recorded — no re-parsing of game text, and no regexes over Polish.

### Events

`model/events.ts` marks three things on the timeline: `login` (from the message
type), `death` and `trait` (from lines the game itself prints as markers, whose
patterns already exist in `src/client/scripts/lvlCalc.ts`).

Deliberately conservative. A marker on the wrong line is worse than no marker,
because the timeline is the one thing a player trusts to say *it happened here*.
To add a kind: add it to `LOG_EVENT_KINDS`, give it metadata and a detector, and
it appears in the lane and the legend automatically.

---

## 2. Structure

```
src/ui/logViewer/
├── LogViewer.tsx           ← state, keyboard, scroll orchestration
├── logViewer.css
├── components/             ← ViewerHeader, SessionSidebar, SearchBar,
│                             ChannelBar, Timeline, LogPane, StatusBar,
│                             LineMenu
├── export/                 ← logHtml (standalone .html), logImage (canvas PNG)
└── model/                  ← pure, fully unit-tested
    ├── channels.ts  events.ts  format.ts
    ├── search.ts    timeline.ts
    ├── types.ts     viewerState.ts
```

Everything derived is computed by **one** function, `deriveView`, rather than a
scatter of `useMemo`s. Rows, the match list, per-session hit counts, channel
counts and the timeline all have to agree about which lines are visible; one
filter pass is the only way to guarantee that.

---

## 3. Behaviour worth knowing

**The timeline's x axis is time, not line index.** Half an hour of standing
still looks like half an hour of nothing. Layers, bottom to top: idle bands
(gaps > 4 min, from *all* lines — a gap that exists only because a channel is
hidden is not a gap), activity histogram (96 buckets),
match ticks, current-match marker, range scrim and handles, viewport box, event
lane, hover hairline. The histogram counts lines passing the channel and search
filters but *not* the range — see below.

**Search never surprises you.** Stepping past the last match wraps and says so;
in All-logs scope it crosses into the next session that has matches and names
it. Invalid regexes show an error state instead of throwing. Zero-length matches
are stepped over (`a*` would otherwise never terminate), and matches per line
are capped.

**Switching sessions keeps the query and every filter** — comparing one search
across sessions is the second thing this viewer is for. Only the match index
resets.

**Follow live releases on user scroll, not on any scroll.** Programmatic scrolls
(jumping to a match, to the bottom, to a timeline position) are inside a 300 ms
grace window; without it, turning follow on immediately turns it off again.

**The log pane is virtualized** (`@tanstack/react-virtual`), and viewport
tracking reads the virtualizer's range rather than scanning the DOM — with rows
unmounted outside the window there is nothing in the DOM to scan.

**A range is a span of time, not a pair of line numbers.** Time is what the
timeline handles move along, and it survives a change of channel filters —
"20:31 to 20:40" still means the same moment after you hide the combat channel,
where "line 900" does not. It is set three ways, all equivalent:

- right-click a line → *Zacznij od tej linii* / *Zakoncz na tej linii*
- drag across the timeline track
- drag either handle once a range exists

The track carries two gestures, separated by a 4px movement threshold: a click
still jumps to that moment, a drag selects. The histogram deliberately ignores
the range — it draws every channel-matching line — because a histogram filtered
by the range would empty exactly the part of the track you need in order to move
the handles. Out-of-range regions are scrimmed instead.

Everything downstream reads the range for free: the match counter, the status
line, and all four exports work on what is visible, which is what makes
"Eksport zakresu" correct by construction rather than by a second code path.
A range belongs to the session it was drawn on, so switching sessions clears it
and it is never persisted.

**Shortcuts are scoped to the viewer's subtree**, never to `window`: a modal
that listens globally steals keys from the game input.

| Key | Action |
|---|---|
| `Ctrl/Cmd+F` | focus and select the search field |
| `Enter` / `Shift+Enter` | next / previous match (in the field) |
| `F3` / `Shift+F3` | next / previous match (anywhere in the viewer) |
| `Esc` | clear a non-empty query; otherwise falls through to the host |
| `[` / `]` | previous / next session |
| `Home` / `End` | start / end of the log |
| right-click a line | range menu |
| `Esc` (menu open) | close the range menu |

---

## 4. Hosting it

```tsx
<LogViewer
  sessions={sessions}                       // any order; it sorts newest-first
  preferences={stored}                      // channels, wrap, density, scope…
  onPreferencesChange={save}
  headerTrailing={<DialogClose />}          // for a modal host
/>
```

`?session=<store name>` on the standalone page preselects a session — that is
how the in-client log browser opens one in a new tab.

View preferences that persist between openings: channels, timestamps, the
tag/line-number columns, the game's colours (on by default), wrapping, search
scope and density. The range and the query do not persist.

---

## 5. Exports

The four file exports work on the visible rows, so a selected range scopes every
one of them and the file names pick up a `_zakres` suffix. "Kopiuj widok" is
narrower still: it copies only what is in the scroll viewport.

| Action | Output |
|---|---|
| Kopiuj widok | the lines on screen, as plain text, to the clipboard |
| Pobierz HTML | a standalone `.html` |
| Pobierz tekst | `.txt` |
| Pobierz jako obraz | `.png` |
| Kopiuj jako obraz | `.png` to the clipboard |

The **HTML** export is self-contained (`export/logHtml.ts`): the in-client
browser's version scrapes the live page's stylesheets with `collectLogStyles()`,
which ties the file to whatever CSS happened to be loaded. Here the colours
travel with the content, so the saved file looks the same on a machine that has
never run the client.

The **PNG** renderer (`export/logImage.ts`) is the in-client browser's, moved
here and given an explicit style argument instead of reading `#logs-preview`;
`src/web/logToImage.ts` is now a thin wrapper over it. One implementation — the
wrapping, ANSI-colour extraction and canvas-size guarding are fiddly enough that
a second copy would drift immediately.

Copying an image throws where the browser has no async clipboard or refuses
images (Firefox still does by default); the viewer reports that in the status
bar rather than failing silently, and the download is always available.

## 6. Not built

- JSON export and the highlight-preserving export are still in
  `src/web/logsExport.worker.ts`, on the old screen.
- "Open folder" — no browser equivalent; the client's File System Access
  integration (`src/web/logFileSaver.ts`) is the nearest thing.
- Bookmarks, timeline zoom, and context lines around matches in "matching lines
  only". Out of scope per the original spec.
- Searching while the game's colours are on falls back to plain text on rows
  that contain a match, because highlighting inside pre-rendered markup would
  mean parsing it. Non-matching rows stay coloured.
- Sessions are loaded eagerly. If that stops scaling, the shape to move to is a
  lines-on-demand `LogSession` plus a cached per-session hit count, keyed by
  (query, flags, channels).
- **The in-client log browser (`src/web/LogBrowser.tsx`, ~1700 lines) still runs
  the old UI.** It is the obvious next migration: most of its bulk is search,
  timeline and rendering that this component already does.

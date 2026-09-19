# Log viewer

The reference screen for the design system: a session log browser with
time-based navigation, search across one log or all of them, and channel
filters. It lives in `src/ui/logViewer` (`@ui/logViewer`).

**Two hosts render it**, and neither owns it:

- the standalone page, `log-viewer/` — its own entry point, its own theme
  setting, reachable in a tab of its own;
- the in-client window, `src/web/LogBrowser.tsx` — the same component in a
  design-system `Dialog`, opened from *Logi* in the menu, plus the session
  management the client alone has (`LogManager.tsx`).

Both load their sessions through `log-viewer/sessionAdapter.ts` and share one
set of stored view preferences, so a fix in either shows up in both. It is
host-agnostic on purpose: it renders into whatever box it is given.

---

## 1. Data

```ts
interface LogLine  { number; timestamp; channel; text; html?; event?; character? }
interface LogSession { id; characters; dayLabel; dateLabel; startedAt; endedAt;
                       live; file; lines }
```

The viewer never touches IndexedDB. `log-viewer/sessionAdapter.ts` is the only
module that knows about stores, `session_<ms>` names and stored record shapes;
the showcase drives the same component from generated mock data.

### Whose log it is, is a list

`characters` is a list because a session is not one character's. The log runs
from page load to page close and a player can re-log in between; a session that
never reached the game has no character at all, so **an empty list is a normal
state** and the date label stands in for a name.

`model/characters.ts` works it out, and the adapter calls it on the way out of
the store — nothing is ever written back into IndexedDB for a label. Two
sources, both ending in the same thing (a name at a line index):

- **GMCP, exact, for logs recorded from now on.** `PlayerIdentity` fires
  `player.character` when a *life* starts, and `sessionLogger` stamps that name
  on the first record after it changed and on no other. The source is
  PlayerIdentity rather than the raw `gmcp.char.info` frame on purpose: it
  already tells a new character from a new body, so a przeobrazenie does not
  reach the log looking like a re-login.
- **The login banner, for logs already recorded.** `Witaj, Dargocie.` is all an
  old log has, and the name in it is a vocative. Nothing generates Polish
  declension here: the candidates are the characters this device has settings
  for (`collectCharacters()`), a small closed set, so the job is to *recognise*
  one — declension changes the ending and keeps the stem, so the longest common
  prefix picks the winner. It has to win by a clear margin and share most of the
  candidate's name, or the log stays unattributed: `Dargoth` and `Dargon` both
  answer to `Dargo...`, and a wrong name is worse than no name. A character
  never played on this device has no settings, so no candidate, and is never
  recognised — a property of the method, not a bug.

What is shown is always the candidate's own name, in titlecase — never the
token read out of the text, which is a vocative. The match only says *which*
character it is.

### Channels come from the parser layer, not from the view

Arkadia tags every line with a GMCP message type as it arrives (`comm`,
`combat.avatar`, `room.long`, `system.login`, …); `sessionLogger` already stores
that type with the line. `model/channels.ts` folds those ~25 types into eight
buckets:

| Channel | GMCP types |
|---|---|
| `comm` — Rozmowy | `comm`, `emotes` |
| `combat` — Walka | `combat.*`, `room.combat` |
| `room` — Lokacja | `room.*`, `living.long`, `object.long` |
| `system` — System | `system`, `system.login`, `prompt` |
| `notify` — Powiadomienia | `notification.*`, `mail`, `editor*` |
| `command` — Komendy | `command` (the echoed player input) |
| `other` — Inne | `other`, `mud`, and any type not folded yet |
| `script` — Skrypty | no type at all |

Prefixes match longest-first, so `room.combat` lands in combat rather than
scenery. Because classification happens at write time, filters work on every log
already recorded — no re-parsing of game text, and no regexes over Polish.

#### System is the client's housekeeping, and only that

The last two buckets are the interesting ones, because they used to be part of
System and that hid things.

`other` is **Arkadia's own** catch-all for game text the server did not tag
more specifically — the trigger catalogue calls it *Pozostale komunikaty*
(`src/web/options/UserTriggers.tsx`). `mud` is what `MudClient.pushChunk` puts
on every chunk arriving outside GMCP msg framing: the login screen, and
anything else unframed. Both are the game talking, and a player hiding System
to quieten the client's chatter was hiding them too.

**An absent type and an unrecognized one are not the same thing**, which is
why `channelForType` has two fallbacks rather than one. Game text always
carries a type — it reaches the logger through `Client.flushLines`, which sets
one on every group. A record with *no* type came from `Client.print`, and that
is the path every script, plugin and `printLine` takes. So an unknown type
falls to `other` (the game said something we do not fold yet) and a missing
type falls to `script` (the client said it). One constant serving both is what
made script output invisible: it was filed under System, where nobody would
look for it.

Adding a channel is safe for logs and filters already stored. Records are
classified on the way out of the store, never written back, and
`applyPreferences` merges a saved filter over `allChannelsOn()` key by key —
so a six-key filter from an older session leaves the two new channels **on**.
A new channel defaulting to hidden would look exactly like lines going
missing, which is why there is a test pinning it.

### Events

`model/events.ts` marks two things on the timeline: `login` (from the message
type) and `death` (from a line the game itself prints as a marker, whose pattern
already exists in `src/client/scripts/lvlCalc.ts`).

A `login` marker carries the character it let in, and the lane writes the name
next to it wherever the session had more than one — which is what makes a
re-login visible rather than merely marked. The name travels back onto the login
line from the record it was stamped on, since the game says who we are a moment
after the banner the player sees.

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
    ├── channels.ts  characters.ts  events.ts
    ├── format.ts    search.ts       timeline.ts
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

**Three scopes: `Wszystkie logi` / `Ten log` / `Zakres`.** The first two differ
only in how many sessions they cover. `Zakres` is the odd one out — it is the
scope in which a selected range is *applied*, so the rows, the counter, the
timeline and all four exports narrow to it together. It is offered only once a
range exists, selecting a range switches to it, clearing one switches back to
whatever you were searching before, and if the range disappears underneath it
the search falls back to the open log rather than reporting nothing found in a
slice that is gone.

**Switching sessions keeps the query and every filter** — comparing one search
across sessions is the second thing this viewer is for. Only the match index
resets.

**Follow live releases on user scroll, not on any scroll.** Programmatic scrolls
(jumping to a match, to the bottom, to a timeline position) are inside a 300 ms
grace window; without it, turning follow on immediately turns it off again.

**The log pane is virtualized** (`@tanstack/react-virtual`), and viewport
tracking reads the virtualizer's range rather than scanning the DOM — with rows
unmounted outside the window there is nothing in the DOM to scan.

Three things about it are worth knowing, because all three are fixes rather
than choices:

- **A row is as tall as the number of visual lines it wraps to.** Rows are
  measured once rendered, but everything above the viewport is only estimated,
  and the estimate is what decides where a jump lands and how steady the
  scrollbar is. A hidden probe row goes through the same grid as a real one and
  reports the text column's width, one character's width and one line's height;
  the estimate is `ceil(length / cols)` lines. With wrapping off it is one
  fixed height, because nothing can wrap.
- **Rows are keyed by their line index in the session**, not by their position
  in the filtered list, so a channel toggle does not throw away every height
  the pane has measured. The cost is that the measurement cache has to be
  invalidated explicitly — `virtualizer.measure()` — whenever density,
  wrapping, the pane's width or the session changes. Without that, offsets go
  on stepping by the old height while the rows are drawn at the new one, and
  they overlap.
- **Jumping to a row is a cancellable job, not `scrollToIndex`.** The offset a
  jump aims at moves as the rows above it stop being estimates and start being
  measurements, so the job re-reads the offset each frame until it holds, and
  any input of the player's own abandons it. `scrollToIndex` instead keeps
  re-snapping for seconds, fighting a player who scrolls away, and gives up
  when the scroll is clamped by a list that has not grown yet — which is why a
  hit in another session used to need a second click.

**A range is a span of time, not a pair of line numbers**, and it narrows the
log only in `Zakres` search scope (see above). Time is what the
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

The range menu is the exception, and both halves of it are fixes the in-client
host forced. Its `Escape` is captured on `window` and `preventDefault`ed —
Radix's dismissable layer stands down on a prevented default, so one press
closes the menu and leaves the window it sits in open. And it closes on a
scroll only when that scroll happened *inside the viewer*: a capture listener
on `window` also sees the game's own log scrolling behind the dialog, which
threw the menu away on every line that arrived.

| Key | Action |
|---|---|
| `Ctrl/Cmd+F` | focus and select the search field |
| `Enter` / `Shift+Enter` | next / previous match (in the field) |
| `F3` / `Shift+F3` | next / previous match (anywhere in the viewer) |
| `Esc` | clear a non-empty query; otherwise falls through to the host |
| `[` / `]` | previous / next session |
| `Home` / `End` | start / end of the log |
| `PageUp` / `PageDown` | one viewport up / down |
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

`?session=<store name>` on the standalone page preselects a session and
`?live=<store name>` says which one is still being written to — that is how
**Nowa karta** in the in-client window hands a log over.

The in-client host (`src/web/LogBrowser.tsx`) differs from the page in three
ways, all deliberate:

- it renders its own `.ark-root` boundary, so it themes correctly in the stock
  dialog *and* inside forge-ui's modal shell, neither of which is a page the
  design system owns;
- it drops `sessionId` out of the restored preferences and always opens the
  session being recorded. Which log you were last reading is a page-level
  convenience; in the client the answer is always "this one" — and two tabs
  sharing one `localStorage` key would otherwise open each other's session;
- its session list is a snapshot taken when the window opens. The live session
  is still flagged live (that is what opens it at its end), but nothing
  streams into the pane while it is open.

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

- Bulk work on the store — the ZIP archive of every session, JSON export and
  import, deletion — is not the viewer's job and never will be: it is a client
  concern, and it lives in `src/web/LogManager.tsx`, opened from the in-client
  window's header. The standalone page reads logs and never writes.
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
- Following a live log *as it is written*. Both hosts take a snapshot; the
  live flag and "Sledz na zywo" only follow what is already loaded. The shape
  of the fix is a subscription that appends to the open session, not a reload.

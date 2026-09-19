# Migrating the rest of the UI onto the design system

Companion to `DESIGN_SYSTEM.md`. That document says how the system works; this
one says how the remaining screens get onto it, in what order, and why that
order.

The numbers below were measured, not estimated — re-measure before trusting them
if this sits for a while.

---

## 1. What is actually left

Less than it looks. Bootstrap enters the build through **exactly one door**:

```
src/web/main.ts → main-theme.css → @import 'bootswatch/dist/darkly/bootstrap.min.css'
```

`editor/`, `viewer/` and `popup/` have their own stylesheets and never load
Bootstrap at all. `log-viewer/` and `design/` are already migrated. So "the rest
of the UI" means **the client entry**, plus whatever `forge-ui` borrows from it.

| Area | Size | Shape of the work |
|---|---|---|
| `src/web/options/` + `hostProxy/` (settings) | 46 files, ~13 000 lines | Real component rewrites — this is where react-bootstrap lives |
| `src/web/*Popup.tsx` (39 popups) | ~8 600 lines of `popups.css` | Mostly **token remapping**, not rewrites |
| Shell: `index.html`, `layout.css`, `style.css` | 144 Bootstrap class uses, 15 declarative modals | Markup + layout CSS |
| `src/web/LogBrowser.tsx` | ~1 700 lines | Fold its newer UX into `@ui/logViewer`, then host that in a popup |
| Bootstrap JS | 3 import sites | `Dropdown`, `Modal` → Radix primitives |

Two measurements matter more than the totals:

- **The popup layer is already variable-driven.** 1 020 `var(--popup-*)` uses in
  `popups.css`, 71 variables per theme, and only 56 hex literals across all 39
  popup components. Re-theming them is a token exercise, not a rewrite.
- **The settings layer is not.** All 46 react-bootstrap files are settings;
  `Binds.tsx` alone is 1 223 lines. This is the long pole and it does not
  shorten by being clever.

---

## 2. Three constraints that decide the order

**(a) `forge-ui` consumes stock settings components.** It imports
`SettingsDialog` plus ten `options/*` modules, and compiles its own scoped
Bootstrap (`forge-modal-bootstrap.scss`) to style them inside its menu modals.
forge-ui is out of scope for redesign, but it is *downstream* of every settings
file we touch. Its scoped Bootstrap must keep working until the last stock
component stops needing it — at which point that file gets deleted, which is a
simplification for forge, not a regression.

**(b) The e2e suite is pinned to Bootstrap class names.** Across 129 specs:
~45 `.btn`, ~40 `.modal`, ~17 `.form-select`, plus a few `.alert`/`.form-check`.
The good news is that 102 `getByRole` and 56 `getByText` uses are already
markup-agnostic and survive any rewrite. **Roughly 110 selectors are the thing
standing between us and freely changing markup.**

**(c) Cascade order is load-bearing and fragile.** `main-theme.css` exists
because Rollup reshuffled shared CSS chunks and flipped the stock cascade — read
its header before touching any import order. Every phase below must keep the
design system's stylesheet and the Bootstrap base from fighting, which
`.ark-root` scoping already handles, provided nothing re-globalises a reset.

---

## 3. The sequence

Ordered by (value × isolation) ÷ risk. Phases 0 and 1 exist purely to make
everything after them cheap and safe; skipping them makes every later phase
riskier than it needs to be.

```
0. Cut the tests loose from Bootstrap classes   ← no product change, unblocks all
1. Token bridge + theme attribute               ← small diff, whole app re-themes
2. One log viewer, hosted twice                  ← fold master's UX in, then share
3. Popups (39)                                  ← mostly token work
4. Settings (46 files)                          ← the long pole, sub-phased
5. Shell: index.html, layout, footer
6. Delete Bootstrap
```

---

## 4. Phase detail

### Phase 0 — Cut the tests loose *(1 PR, no product change)*

Replace the ~110 Bootstrap-class selectors in `e2e/` with role, text or
`data-testid` selectors, **against the current markup**, adding `data-testid`
to the Bootstrap DOM where no stable role exists.

Nothing user-visible changes, so the PR is reviewable as "tests only" and the
suite proves itself: it must stay green without any source change.

*Exit:* `grep -rE "\.(btn|modal|form-select|form-check|alert)\b" e2e/` is empty.

Why first: after this, every later phase can rewrite markup without a test
rewrite tangled into the same diff. Skipping it means each later PR mixes
"did the behaviour change?" with "did the selector change?", which is exactly
the mix that hides regressions.

### Phase 1 — Token bridge and theme attribute *(1 PR, small, high blast radius)*

1. Put `class="ark-root" data-ark-theme="…"` on `<body>` in `index.html`.
2. Teach `uiSettingsCore.apply()` to set `data-ark-theme` alongside the existing
   `theme-*` class, from one setting, via a mapping table
   (`fantasy → fantasy`, `dark-neutral → dark-neutral`, `default → arkadia`,
   `custom-dark → custom` + seed colour, …).
3. Add **`src/web/themes/bridge.css`**: redefine the 71 `--popup-*` variables in
   terms of `--ark-*`.

Step 3 deserves a note, because it is the opposite of the rule in
`DESIGN_SYSTEM.md`. That rule bans aliasing **new → old** (a new token must
never be defined as an old one). This is **old → new**, and it is temporary: it
makes 1 020 existing CSS declarations re-theme from the new token layer on the
day it lands, without touching a single component. The file must carry its own
deletion criterion in a header comment — *deleted when no `var(--popup-` remains
outside it* — and Phase 3's exit condition is what deletes it.

*Exit:* every existing screen renders under `data-ark-theme`, all 8 themes plus
a custom colour, with no visual regression. Verify by screenshotting the client
in each theme before and after.

*Risk:* highest of any phase, because it touches everything at once. Mitigated by
it being a pure re-pointing of variables — no markup, no components — so a
regression shows up as a wrong colour, not a broken screen, and reverts cleanly.

### Phase 2 — One log viewer, hosted twice *(2 PRs)*

**Revised after `d76a392` ("przeglad UX okna logow") landed on master.** That
commit put ~915 lines of UX work into `src/web/LogBrowser.tsx` in parallel with
`@ui/logViewer` being built, so the original plan — delete the old browser and
mount the new one — would throw away work that is newer and in places better.

The agreed shape instead: **one component, two hosts.** The standalone page and
the in-client browser render the same `@ui/logViewer`; in the client it lives in
a popup rather than getting its own screen. Nothing is deleted until the shared
component is at least as good as what master has today.

**PR 1 — fold master's improvements into `@ui/logViewer`.** Measured against
master, the shared component is missing:

| Gap | Where master does it |
|---|---|
| A third search scope, **Zakres** — search within the selected range only | scopes are `Wszystkie` / `Ten log` / `Zakres` |
| `PageUp` / `PageDown` scrolling | `LogBrowser.tsx:1255` |
| Row height estimated from text length, rather than one fixed height | `estimateSize(index)`, `LogBrowser.tsx:935` |
| A cancellable scroll job instead of `scrollToIndex`, so a cross-session jump lands on the first click | `cancelScrollJob` |

The last two are worth taking seriously rather than porting mechanically: both
are fixes for the same class of virtualizer problem that produced three bugs in
this work already (frozen scroll height, density overlap, oversized viewport
box). Master's variable-height estimate is the better answer for wrapped lines
than the fixed `lineHeight` the shared component uses now.

**Done.** All four landed, plus a fourth cross-session-jump bug that was the
shared component's own: two scroll effects fired on the same render and the
session one ran last, so a hit in another log was overridden by "start this
session at the top". `Zakres` scope is where the shared component departs from
master deliberately — a range narrows the log only in that scope, so the two
wider scopes can search the whole log without master's trick of silently
destroying the range to reach a hit outside it. See `LOG_VIEWER.md`.

**PR 2 — host it in the client.** `LogBrowser.tsx` becomes a popup mounting the
shared component, reusing `log-viewer/sessionAdapter.ts`. What does *not* come
across for free, and must be ported or consciously dropped:

- the ZIP export of all sessions (`logsExport.worker.ts`)
- the sessions-management tab (delete, download-status, file-save directory)
- JSON export and the highlight-preserving HTML export

`e2e/logs-browser.spec.ts` (new on master, 179 lines) is the acceptance test for
this phase: it describes the behaviour the shared component has to keep.

### Phase 3 — Popups *(4–6 PRs, grouped by family)*

39 components. Per popup: swap ad-hoc chrome for `@design` primitives, replace
that popup's `--popup-*` reads with semantic tokens, delete its slice of
`popups.css`, remove its hex literals (56 across the whole layer).

Group by family so each PR is one coherent review: combat/status, world/travel,
knowledge/reports, inventory/economy, debug.

*Exit:* `popups.css` is gone or vestigial, and `themes/bridge.css` can be
deleted — which is the signal that the legacy token layer is dead.

### Phase 4 — Settings *(6–8 PRs, by tab)*

The long pole: 46 files, ~13 000 lines, all the react-bootstrap.

Sequence within the phase:

1. **`SettingsDialog` shell first** — Radix `Dialog` + `Tabs`, with the existing
   tab bodies rendered inside it unchanged. One PR, immediately visible, and it
   establishes the container every later PR drops into.
2. **Then a tab per PR**, smallest first to shake out missing primitives:
   Shortcuts (113) → Aliases (204) → ShortExits (210) → Scripts (218) →
   … → MobileButtons (761) → Settings (855) → FirebaseTab (1 064) →
   Binds (1 223).
3. **Coordinate with forge-ui** on the ten modules it imports. Each migrated
   module can drop out of `forge-modal-bootstrap.scss`'s scope; the file shrinks
   PR by PR and is deleted at the end.

Expect this phase to surface primitives the system does not have yet —
`Table`, `Accordion`, `ProgressBar`, `Alert` are the likely four. Add them to
`@design` when the second screen needs them, not the first.

### Phase 5 — Shell *(1–2 PRs)*

`index.html`'s 144 Bootstrap class uses and **15 declarative modals**, plus
`layout.css` and the mobile footer. The modals are the real work: they are
driven by `bootstrap/js/dist/modal` from three call sites and become Radix
dialogs mounted from React.

`AGENTS.md` prefers elements declared in HTML, so keep the shell markup
declarative where it is genuinely static, and move only the modal shells into
React.

### Phase 6 — Delete Bootstrap *(1 PR)*

Drop the `bootswatch` import from `main-theme.css`, remove `bootstrap`,
`bootswatch`, `react-bootstrap` and `@types/bootstrap` from `package.json`,
delete `forge-modal-bootstrap.scss`, and remove the `scss` handling from
`vite.config.ts` (it exists solely for that file).

*Exit:* `grep -r "bootstrap" src/ index.html` returns nothing but prose.

---

## 5. Rules that hold across every phase

- **One screen per PR, fully migrated.** Never half-migrate a screen: mixing
  `--popup-*` and `--ark-*` inside one component is how a theme ends up
  half-right and nobody notices which half.
- **Delete as you go.** A migration PR that adds new CSS without removing the
  old one has not migrated anything.
- **Verify in a browser, in more than one theme.** Every bug found in this
  work so far — the frozen scroll height, the density overlap, the oversized
  viewport box, the buttons with no background — passed the type checker, the
  build and the unit tests. Only looking at it found them.
- **Screenshot before and after.** For a redesign, that diff *is* the review.
- **No hex in a component stylesheet.** Already enforced by a unit test for the
  design system; extend that test's file list as each screen migrates.

---

## 6. Sizing

Rough, and deliberately coarse:

| Phase | PRs | Relative effort |
|---|---|---|
| 0 — tests | 1 | S |
| 1 — token bridge | 1 | S diff, L care |
| 2 — log browser | 1 | M |
| 3 — popups | 4–6 | L |
| 4 — settings | 6–8 | XL |
| 5 — shell | 1–2 | M |
| 6 — deletion | 1 | S |

Phase 4 is roughly half the total. Phases 0–2 are worth doing even if the rest
stalls: 0 and 1 leave the codebase strictly better off, and 2 deletes more code
than it adds.

---

## 7. Open questions

- **Do the 7 legacy themes survive by name?** The new system ships 8. The
  mapping is needed for Phase 1 either way, but if some legacy themes can be
  retired, the bridge gets simpler and the picker gets shorter.
- **Does `forge-ui` eventually consume `@design` too?** Out of scope today. If
  the answer is ever yes, Phase 4 should stop re-styling stock components for
  forge's scoped Bootstrap and let forge adopt the system instead.
- **Is the in-client log browser's session-management tab worth porting**, or
  does the standalone page cover it?

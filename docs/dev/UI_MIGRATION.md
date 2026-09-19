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
| ~~`src/web/LogBrowser.tsx`~~ | ~~~1 700 lines~~ | **Done** — it is now a ~110-line host around `@ui/logViewer` |
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

Two things about this that only showed up once Phase 4 started. First,
`forge-modal-bootstrap.scss` compiles Bootstrap **whole**, under one
`.forge-menu-modal` prefix; there is nothing in it to remove per migrated
module, so it shrinks not at all and then disappears all at once. Second, and
larger: **forge loads no part of the design system.** No `@design/css/index.css`
import, no `.ark-root`, no `data-ark-theme` anywhere in `forge-ui/`. A migrated
component rendered in a forge menu modal resolves no `--ark-*` at all, which is
not a wrong colour but an invalid-at-computed-value for every one of them. Phase
4 PR 1 works around it from the stock side (see that phase), but the real
question is §9's, and it is now on the critical path rather than hypothetical.

**(b) The e2e suite is pinned to Bootstrap class names.** Across 129 specs:
~45 `.btn`, ~40 `.modal`, ~17 `.form-select`, plus a few `.alert`/`.form-check`.
The good news is that 102 `getByRole` and 56 `getByText` uses are already
markup-agnostic and survive any rewrite. **Roughly 110 selectors are the thing
standing between us and freely changing markup.**

**(c) The stock client's element-level CSS reaches into migrated screens.**
`.ark-root` sits on `<body>` (Phase 1) and the design system's own element
reset is wrapped in `:where()` so primitives can win — which leaves a bare
`button { … }` rule in `style.css`, loaded *after* the system, outranking every
primitive that does not happen to set that property. Phase 2 found it the hard
way: `padding: 0.75vh 2vw` blew a 16px checkbox out to 53px and `opacity: 0.75`
dimmed every control in the window. The rule is now guarded with
`:where(:not([class^='ark-'], …))`, which keeps its specificity and stops it at
the boundary. It is the only global element rule left in the stock sheets —
but the failure mode is the thing to remember, because it is silent: nothing
breaks, things just come out the wrong size.

The same shape bit the layering. `--ark-z-dialog` was 101, against a stock
stack that runs to 10100, so the first design-system dialog in the client had
the mobile keypad and the input bar poking through it. The z tokens are now
absolute values chosen against that stack.

**(d) Cascade order is load-bearing and fragile.** `main-theme.css` exists
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
0. Cut the tests loose from Bootstrap classes   ← DONE (#1333)
1. Token bridge + theme attribute               ← DONE (themes/bridge.css)
2. One log viewer, hosted twice                  ← DONE (#1334, #1341)
3. Popups (39)                                  ← IN PROGRESS: PR 1 (combat/status) done
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

**PR 2 — host it in the client. Done.** `LogBrowser.tsx` went from 2 009 lines
to ~110: it loads sessions through `log-viewer/sessionAdapter.ts` and renders
`@ui/logViewer`. The window is a design-system `Dialog` (`size="full"`, the
size the primitive was written for), mounted from React — so the declarative
`#logs-modal` left `index.html` and one of the three `bootstrap/js/dist/modal`
import sites went with it. `LogTimeline.tsx`, `logToImage.ts`, ~460 lines of
log CSS in `style.css` and most of `logBrowserUtils.ts` are gone.

It was already presented as a modal before this, not as a screen, so "in a
popup rather than its own screen" was a change of dialog, not of shape.

What did not come across for free:

- **the ZIP export, JSON export/import and deletion: ported**, into a
  `LogManager` window opened from the viewer's header (see §9). One trap
  there: the exports wrap their lines in `<div id="logs-preview">` and used to
  borrow that element's rules off the live page, which deleting the old pane's
  CSS quietly took away. `collectLogStyles()` now writes that frame out
  itself and only scrapes the page for the game's ANSI colours — with a unit
  test and an e2e that unzips the archive and reads it, because a saved file
  that has merely lost its monospace column still builds and still opens.
- **the highlight-preserving HTML export: dropped, superseded.** The shared
  `export/logHtml.ts` writes a self-contained file whose colours travel with
  the content, rather than scraping whatever stylesheets the page happened to
  have loaded.
- **the file-save directory: not ported, and never lived here.** It is a
  switch on *Interfejs > Inne* (`logFileSaver.ts`); the browser only ever
  showed the resulting "saved to disk" column, which the manage window keeps.

Known limitation: the pane takes a snapshot when the window opens, the way the
old browser did. The session being recorded is still marked live, because that
is what opens it at its end — but "Sledz na zywo" has nothing to follow until
the window is reopened. Streaming into it is a follow-up, not a regression.

`e2e/logs-browser.spec.ts` is the acceptance test. Its behaviour survived
unchanged; its *selectors* did not, because the markup is the shared
component's now — see the PR body for the mapping.

### Phase 3 — Popups *(4–6 PRs, grouped by family)*

39 components. Group by family so each PR is one coherent review: combat/status,
world/travel, knowledge/reports, inventory/economy, debug.

**PR 1 (combat/status) is done** — nine popups: Postawa, Walka, Statystyki,
Postepy, Postepy 2, Cechy, Zabici, Zabici 2, Odpornosci przeciwnikow. It also
landed the shared pieces every later popup PR depends on, described below.

*Exit:* `popups-base.css` is gone or vestigial, and `themes/bridge.css` can be
deleted — which is the signal that the legacy token layer is dead.

#### Three things PR 1 found that this plan had wrong

**(1) `popups.css` has two hosts, and only one of them owns the design system.**
`forge-ui/main.tsx` imports `@web/popups/popups.css` and renders the *same*
`POPUP_CATALOG`, with its own bronze `--popup-*` palette, no `.ark-root`, no
`data-ark-theme` and no `@design/css/index.css`. Constraint (a) above noticed
only that forge consumes *settings* components. So "replace this popup's
`--popup-*` reads with `--ark-*`" is not a local edit: done naively it leaves
every migrated popup in forge with no tokens at all — no background, no border,
no text contrast.

The fix that does not touch forge is `src/web/popups/popup-host-tokens.css`: a
bridge in the opposite direction, mapping forge's `--popup-*` onto the `--ark-*`
roles, scoped `body:not(.ark-root)` so it can never meet `themes/bridge.css` and
form a variable cycle. It also repeats the non-colour ramps, because those live
behind `[data-ark-theme]` too; a test compares them against `tokens.css` so they
cannot drift.

**This is a workaround, and the real fix is three lines in `forge-ui`** — import
`@design/css/index.css`, put `ark-root` + `data-ark-theme="forge"` on its root,
add a `forge` theme to `themes.config.mjs`. That is out of scope today, and the
bridge carries it as its deletion criterion. Whoever is allowed to touch
`forge-ui` should do it and delete the file.

**(2) Popups are not cleanly separable by family.** They share Layer-2 chrome
(`.popup-btn`, `.popup-tab`, `.popup-empty`, `.popup-split-*`, the header strip)
and, worse, they borrow each other's classes across families: the resistances
popup was built out of `.zlom-*` (inventory) and `.carriage-remove-btn`
(travel). Leaving Layer 2 on `--popup-*` would half-migrate every popup in every
family, so **PR 1 migrated Layer 2 for everyone**. Through `bridge.css` that is
a computed no-op — `--popup-control-bg` *was* `--ark-bg-element` — and the
screenshots confirmed it pixel for pixel. Later PRs inherit a migrated Layer 2
and should not need to touch it.

**(3) A per-popup stylesheet may not be imported by its component.** Layer 2 and
a per-popup delta are both specificity 0,1,0, so only source order decides which
wins. That was automatic while everything sat in one file. Split into
`CechyPopup.css` and pulled in by `import './CechyPopup.css'`, the order becomes
Rollup's to choose — and it put the deltas in a chunk the built `index.html`
links *before* the one holding Layer 2. The cascade inverted and the Cechy
"Wlacz modyfikatory" button silently lost its amber. This is constraint (c)
biting exactly as advertised, and it was found by looking at screenshots, not by
any test.

So `src/web/popups/popups.css` is now a **manifest**: nothing but an ordered
`@import` list (tokens, then `popups-base.css`, then each migrated popup sheet).
`@import` inlines in source order into one chunk, so Rollup has nothing to
reorder, and the path forge-ui imports is unchanged. Three unit tests hold the
rule.

#### The per-popup recipe

Follow this literally; it is what PR 1 converged on.

1. **Take the whole family at once, including anything it borrows.** Grep the
   popup's TSX for class names and check which belong to another family. Either
   migrate the borrowed component onto a primitive (the resistances popup went
   to `Table` and stopped borrowing `.zlom-*`) or leave that class alone in
   `popups-base.css` — never migrate half of it.
2. **Cut the slice out of `popups-base.css`** into `src/web/<Name>Popup.css`.
   Section markers (`/* ── name ── */`) are the slice boundaries.
3. **Add it to the manifest** `src/web/popups/popups.css`, after
   `./popups-base.css`. **Do not** add an import to the component.
4. **Swap the variables** using `themes/bridge.css` read backwards — it is the
   authoritative `--popup-*` → `--ark-*` table, and following it exactly is what
   makes the change a computed no-op. `--popup-data-*` is the one family that is
   not a straight swap: see below.
5. **Kill the hex literals**, in the stylesheet *and* in the component (inline
   styles, SVG `fill`, colour maps in TS — `StatPopup.tsx` had three).
6. **Swap chrome for `@design` primitives** where one genuinely replaces
   bespoke markup: `Table`, `Button`, `Segmented`, `EmptyState`, `Input`,
   `Icon`. Do not force it; a tokenised bespoke gauge beats a primitive that
   does not fit.
7. **Add the stylesheet to `MIGRATED_SHEETS`** in
   `test/ui/design/stylesheets.test.ts`. That is what enforces no-hex and
   no-`--popup-*` from then on; a migrated sheet left off the list keeps the
   tokens but loses the rule.
8. **Screenshot before and after, in at least three themes**, one dark, one
   light, one with a strong accent. Diff them. A pure token swap should come out
   near-identical; anything that moved and should not have is a cascade or
   specificity bug. This is the step that found (3).

#### `--popup-data-*`: decided

`bridge.css` left the sixteen `--popup-data-*` variables out and wrote "Phase 3
decides their fate". **Decision: the design system gets a real categorical
palette, and the sixteen are retired.** See `DESIGN_SYSTEM.md` §3.

The audit of all 71 uses is what settled it: they were never one family. A
`spring-green` / `yellow` / `tomato` triple ranked things (resistance quality,
kill rates, progress) — that is *status* wearing a data costume, and it went to
`--ark-success/warning/danger`, which is precisely the rule that keeps it
reading right in all eight themes. What was left genuinely only needed to be
*distinguishable*, so it became `--ark-data-1..6`, generated from Radix like the
status hues.

The two alternatives were considered and rejected. *Keeping them as a hand-tuned
legacy layer* fails the phase's own exit condition — 16 variables × 7 themes is
112 hand-maintained values, and they are spelled `var(--popup-`, so `bridge.css`
could never be deleted while they live. *Mapping all sixteen onto existing
roles* is what `bridge.css` refused to do for good reason: it would have forced
six non-ranking hues onto `success`/`warning`/`danger` and broken the rule that
status colours mean one thing.

### Phase 4 — Settings *(8–10 PRs, by page)*

The long pole: 46 files, ~13 000 lines, all the react-bootstrap. Of those 46,
the ones reachable from the settings dialog are 15 *pages*; the other ten are
standalone modals that belong to Phase 5 (see below).

**Rewritten after PR 1.** The sequence below used to say "`SettingsDialog`
shell first — Radix `Dialog` + `Tabs`" and then list Shortcuts / Aliases /
ShortExits / Scripts as the first tabs. All of that was written against an
older tree and every part of it was wrong by the time anyone acted on it. What
the tree actually looks like:

- **The shell was never react-bootstrap.** `SettingsDialog.tsx` is 390 lines
  with no react-bootstrap import; `settingsDialog.css` had no hex literal. It
  was *bridged*, not unmigrated — 18 `var(--popup-*)` reads, three Bootstrap
  class names (`.form-control`, `.form-select`, `.alert`). The job was to
  re-point it, not to rewrite it.
- **It is not a Radix `Dialog`, and must not become one yet.** The dialog
  chrome — title, Save, the close button, the backdrop — belongs to
  `#settings-modal` in `index.html` and is driven by `bootstrap/js/dist/modal`.
  `SettingsDialog` is only the *body*; it hooks `show.bs.modal` /
  `hidden.bs.modal` on that element, and forge fakes those same events on its
  own shell (`MenuModalHost.tsx`). Turning the chrome into a Radix dialog is
  **Phase 5** work (it is one of that phase's 15 declarative modals) and it
  breaks forge unless forge changes with it.
- **It is not `Tabs` either.** The navigation is a two-group sidebar of 15
  pages with a search box, a per-page unsaved-changes dot and, under 40rem, a
  native `<select>`. `@design`'s `Tabs` is a horizontal tablist and does not fit.
- **Shortcuts, Aliases and Scripts are not tabs.** Nor are Binds, Recordings,
  UserTriggers, LocationNotes, ExportImport, CharacterManagementModal or
  HelperSettings. All ten are standalone modals mounted into their own roots
  from `index.html` (`src/web/main.ts` ~line 1536) — they are exactly the ten
  modules forge imports, and their shells are Phase 5, not Phase 4.
- **`ShortExitsSettings.tsx` (210 lines) is dead code.** Nothing imports it.
  The live short-exits UI is a section inside `Settings.tsx`. Delete it; do not
  migrate it.

The real Phase 4 population is the 15 pages in `settings/categories.ts`, served
by `useCharacterSettingsPages.tsx` and `useUiSettingsPages.tsx`. A page is the
unit of migration, not a file: `character-combat` is four components, and
`ui-other` is two.

Sequence within the phase:

1. **Shell and the shared control layer** — done in PR 1. `settingsDialog.css`
   is on `--ark-*`; `src/web/settings/controls.tsx` holds the migrated
   `SettingsCard` / `SettingsRow` / `CheckboxField` / `SelectField` /
   `ColorField`, the counterpart of `uiSettings/fields.tsx` and of the
   hand-rolled `.character-settings-section` markup. Both old layers stay until
   the last page leaves them.
2. **Then a page per PR**, smallest first. Done: `ui-commands`, `ui-other`,
   `character-guilds`, `character-magics`. Remaining, roughly by size:
   `ui-windows` → `ui-footer` (pulls in BarOrderSettings +
   FooterComponentSettings) → `ui-appearance` → `ui-map` → `ui-sound` →
   `character-items` / `character-general` (both are sections of
   `Settings.tsx`, 855 lines, so they land together) → `character-combat`
   (CombatCommands + DrawSheathe + EnemyBinds + LuaGags) → `ui-buttons` /
   `ui-mobile-buttons` / `ui-radial` (the button editors, 761 lines).
3. **Coordinate with forge-ui** on the ten modules it imports. Note that
   `forge-modal-bootstrap.scss` compiles Bootstrap *whole*; it cannot shrink
   per module, only be deleted once nothing forge renders needs Bootstrap at
   all. Since forge renders the entire `SettingsDialog`, that means after the
   last settings page **and** the ten standalone modals.

#### What a page actually needs

- **`@design`'s `Select` does not replace a `<select>`.** It is a Radix listbox:
  no `<optgroup>`, and Playwright's `selectOption()` does not drive it. The e2e
  suite uses `selectOption` on `#luaGag-*`, `#ui-multibind-key-hints`,
  `#settings-category-select` and more. Migrated pages keep a native `<select>`
  styled from tokens (`.settings-native-select`). The same goes for
  `<input type="color">` — there is no colour-picker primitive.
- **`@design`'s `Checkbox` is a `<button role="checkbox">`.** Two consequences,
  both handled in PR 1 and both silent if you miss them: `<label for>` cannot
  activate a button (so `CheckboxField` clicks it itself), and
  `settingsDirty.ts` had to learn to read `data-state` or the unsaved-changes
  dot quietly stops working on migrated pages.
- **`@design`'s `Icon` has 15 names.** Settings needs far more, and they are
  domain icons (plecak, miecze, tarcza) that no other screen wants. The
  category icons in `SettingsDialog.tsx` import lucide directly and say why.
- **The tokens have to reach forge.** Phase 3 hit this independently for
  popups and wrote it up above; the settings dialog has exactly the same
  problem through a different host. `forge-ui/` loads no part of the design
  system, so a migrated component inside a forge menu modal resolves *no*
  `--ark-*` at all — borderless controls, transparent fills. `SettingsDialog`
  therefore imports `@design/css/index.css` itself (forge lazy-imports the
  component into a shell that has no entry point of ours) and sets
  `data-ark-theme` on its host **only when no ancestor already has one** — the
  stock client's `<body>` has it, so there the player's theme still wins, and
  the fallback switches itself off the day forge grows the attribute. It
  deliberately does not set `.ark-root`: that is the visual opt-in, and
  claiming it would repaint the pages still on Bootstrap.

  **These two answers should converge, and Phase 3's is the better one.**
  `popup-host-tokens.css` maps forge's `--popup-*` *onto* the `--ark-*` roles,
  so a migrated popup in forge stays bronze; the settings fallback picks a
  design-system theme instead, so the dialog stops matching forge's chrome.
  Converging means adding forge's menu-modal host to that file's selector list
  (it is scoped to `.managed-panel, [data-popup-overlay]`, and the settings
  dialog lives in `.forge-menu-modal`) and dropping the fallback here. Left as
  a follow-up rather than done in Phase 4 PR 1: the two landed in parallel, and
  the file belongs to Phase 3. The `@design/css/index.css` import stays either
  way — the bridge supplies token *values*, not the `.ark-*` primitive classes.
- **`Table` now exists** (Phase 3 added it for the resistances popup), so the
  pages that need one — `Binds`, `FirebaseTab`, `DeviceManagementTab` — no
  longer have to wait on a decision. `ProgressBar` still does not exist.
  `Alert` is `Callout`, which exists; `Accordion` has not been needed yet.

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
  design system; extend that test's file list as each screen migrates
  (`test/ui/design/tokens.test.ts`, `MIGRATED_SCREEN_SHEETS` — it also checks
  the screen reads no `--popup-*`, which is the other half of "migrated").
- **Watch the stock shell's bare-element rules.** `DESIGN_SYSTEM.md` §6 warns
  about `base.css` out-specifying its own primitives; the stock client has the
  mirror-image problem. `style.css` skins bare `button`, and Radix builds
  `Checkbox`, `Switch`, `Toggle`, `Segmented`, `Tabs` and the `Select` trigger
  out of `<button>`. A bare `button` selector loses to `.ark-checkbox` only for
  the properties that class declares — `padding`, `opacity`, `border-radius`,
  `min-width` are not among them, so a 16px checkbox rendered as a 60px
  translucent pill. Phase 4 PR 1 excluded `ark-`-prefixed classes from those
  rules with a zero-specificity `:where(:not(...))`. `log-viewer/` never hit
  this because it is a separate entry that does not load `style.css`; any screen
  migrating inside the client entry will.

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

## 7. Queued follow-up

- **Delete `src/web/options/ShortExitsSettings.tsx` (210 lines).** Nothing
  imports it; the live short-exits UI is a section of `Settings.tsx`. Found
  while picking Phase 4's first tabs — the plan had it queued for migration.

- ~~**Character attribution for logs**~~ — done, see
  `LOG_CHARACTER_ATTRIBUTION.md` and `LOG_VIEWER.md` §1. The log carries a
  *list* of characters, re-logins are named on the timeline, and the `trait`
  marker is gone.

---

## 8. Theme tuning comes last

**Palette work is the final step of the migration, after Phase 6.** Not because
it is unimportant — because it is the one thing that can be judged only once
every screen is on the system. Tuning a ramp while half the client still reads
`--popup-*` means tuning against a moving target, and re-tuning later anyway.

Two things are deliberately parked until then:

- **`fantasy`, `forest` and `icy` lost their strong colour cast.** The old
  themes painted chrome heavily (purple / green / navy); the new system's gray
  ramps (mauve, olive, slate) are near-neutral by design and leave colour to the
  accent. That is the palette working as intended, not a bridge bug — but if
  those themes should still shout, it is a `themes.config.mjs` decision.
- **The active tab reads weakly in the two light themes.** `.popup-tab--active`
  is accent text on an accent tint; on `parchment` and `silver` both steps are
  pale and the active tab barely separates from its neighbours, where on the
  dark themes it is obvious. Computed values are identical before and after
  Phase 3 (it is a Phase-1 bridge characteristic, not a migration regression),
  so it is parked here rather than fixed. The fix is probably a stronger step
  for the active tab's fill, not a per-theme special case.

- **Anything else that is "the new palette is different", rather than "this
  screen is broken".** File it here; do not fix it mid-migration.

The one exception already taken: the default theme's accent is **blue, not
amber**. `arkadia` is what `default` maps onto, and the stock client's accent
was Bootstrap's blue long before the redesign, so leaving it amber would have
changed colour out from under every player who never picked a theme. That is a
continuity fix, not palette tuning.

---

## 9. Open questions

- ~~**Do the 7 legacy themes survive by name?**~~ **Answered:** there are 8, and
  they map 1:1 onto the new set, with two renames and one default:
  `light-parchment → parchment`, `light-silver → silver`, `default → arkadia`;
  `custom-dark` becomes `custom` plus a seed colour. The mapping table lives in
  Phase 1's change to `src/web/uiSettingsCore.ts`.
- **Does `forge-ui` eventually consume `@design` too?** Out of scope today. If
  the answer is ever yes, Phase 4 should stop re-styling stock components for
  forge's scoped Bootstrap and let forge adopt the system instead.
- ~~**Is the in-client log browser's session-management tab worth porting**, or
  does the standalone page cover it?~~ **Answered: ported.** The standalone
  page does not cover it and should not. It *reads* logs and never writes to
  the database — that is what lets it be a plain page with no character
  context — so nothing on it can delete a session, archive one or put one
  back. Dropping the tab would have left the client with no way to remove a
  log at all, and IndexedDB only grows; it would also have thrown away the
  only backup path there is, since the JSON export/import round trip is the
  one thing that moves a log between devices.

  So it is ported, and in full: bulk ZIP export (`logsExport.worker.ts`),
  "select the ones not yet archived" with its downloaded flag, the
  saved-to-disk column, JSON export, JSON import and deletion. What changed is
  where it lives. It is no longer a *tab* — a tab implies two things you
  switch between, and this is a rare administrative errand next to the thing
  you actually came for. It is a `LogManager` window (`src/web/LogManager.tsx`)
  opened by **Zarzadzanie** in the viewer's header, which also let the tab
  strip and its DOM-poking effect leave `index.html`.

  Two things fell out of loading every session eagerly: the manage window
  reads line counts and time spans off `LogSession[]` instead of re-counting
  through IndexedDB, and `alert`/`confirm` are gone — the outcome of an import
  is a `Callout` in the window, and a delete is confirmed by a real dialog.

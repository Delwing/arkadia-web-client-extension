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
0. Cut the tests loose from Bootstrap classes   ← DONE (#1333)
1. Token bridge + theme attribute               ← DONE (themes/bridge.css)
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
- **The tokens have to reach forge.** `forge-ui/` never loads
  `@design/css/index.css` and has no `data-ark-theme` anywhere, so a migrated
  component rendered inside a forge menu modal would resolve *no* `--ark-*` at
  all — borderless controls, transparent fills. `SettingsDialog` therefore
  imports the design stylesheet itself and sets `data-ark-theme` on its host
  **only when no ancestor already has one**. It deliberately does not set
  `.ark-root`: that is the visual opt-in, and claiming it would repaint the
  pages still on Bootstrap. The consequence, which is a real product decision
  and not a bug: inside forge the settings dialog now renders in a
  design-system theme rather than forge's bronze. §9's "does forge-ui consume
  `@design` too?" is no longer entirely hypothetical.
- **`Table` and `ProgressBar` still do not exist.** The pages that need a table
  (`Binds`, `FirebaseTab`, `DeviceManagementTab`) are all large and late, so the
  decision can wait. `Alert` is `Callout`, which exists; `Accordion` has not
  been needed yet.

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
- **Is the in-client log browser's session-management tab worth porting**, or
  does the standalone page cover it?

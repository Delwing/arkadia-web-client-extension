# Design system

The client's new base look: **Radix primitives for behaviour, our own CSS for
everything visual, and one semantic token layer that makes theming work.**

It lives in `src/ui/design` and is imported as `@design`. It currently drives
the standalone log browser (`log-viewer/`), the showcase (`design/`) and the
in-client Logi window; the rest of the stock UI is still on Bootstrap and
migrates screen by screen.

---

## 1. Why this shape

**Radix primitives, not a styled component library.** `radix-ui` supplies the
things that are tedious and easy to get wrong — focus trapping and restore,
scroll locking, roving tabindex, typeahead in listboxes, correct popper
placement — and no visual opinions. `@radix-ui/themes` was rejected: it ships
its own CSS, and the whole point here is that *we* own the look across eight
themes.

**Radix Colours as the palette source, at build time only.** Not for the
specific hues, but for the *structure*: twelve steps with fixed meanings across
every scale. That is what lets a new theme be a two-line config entry rather
than a hand-tuned palette, and what stops components from needing per-theme
special cases. Nothing from `@radix-ui/colors` reaches the browser — a Node
script reads it and emits plain custom properties.

**No aliasing of the old `--popup-*` variables.** A new token must never be
defined in terms of an old one, and a screen is either migrated or it is not;
there is no half-state where a token means one thing here and another there.

There is one deliberate, temporary exception, in the other direction:
`src/web/themes/bridge.css` redefines the *old* `--popup-*` and `--footer-*`
variables in terms of `--ark-*`, so the not-yet-migrated stock client repaints
from this token layer (Phase 1 of `UI_MIGRATION.md`). It carries its own
deletion criterion — *deleted when no `var(--popup-` remains outside it* — and
Phase 3 is what deletes it. Nothing under `src/ui/design` reads `--popup-*`, so
the rule above still holds where it matters.

Phase 3 added a second, narrower exception in the *opposite* direction:
`src/web/popups/popup-host-tokens.css` defines `--ark-*` from `--popup-*` for a
host that loads the system's stylesheet but never opts into a theme. There is
exactly one — `forge-ui`, which renders the same popup catalogue from the same
stylesheet and has its own bronze `--popup-*` palette. Without it a migrated
popup renders in forge with no tokens at all. It is guarded by
`body:not(.ark-root)` so the two bridges can never meet and form a cycle.

**Its deletion criterion is the theme attribute, not the import.** Phase 3 PR 1
wrote "dies the day forge-ui loads `@design/css/index.css` itself" — forge has
imported it since `f087744`, and the bridge is still load-bearing, because
`tokens.css` is scoped `:where([data-ark-theme])` and forge sets no such
attribute. What the import *does* buy is the primitives: `.ark-table` and the
rest are styled in forge, so a migrated popup may use an `@design` primitive
freely. The file dies when forge puts `ark-root` + `data-ark-theme` on its root
and takes a theme of its own.

---

## 2. Layout of the code

```
src/ui/design/
├── css/
│   ├── index.css              ← import THIS; @imports everything in order
│   ├── scales.generated.css   ← GENERATED: raw colour steps per theme
│   ├── tokens.css             ← semantic roles, written ONCE
│   └── base.css               ← the `.ark-root` opt-in boundary
├── primitives/                ← one .tsx + one .css per primitive
├── themes/
│   ├── themes.config.mjs      ← the theme catalogue (generator input)
│   └── theme.ts               ← runtime: applying themes, custom colours
├── cx.ts
└── index.ts                   ← the public surface (`@design`)

scripts/build-design-tokens.mjs ← yarn build:design-tokens
design/                         ← the showcase entry point
```

---

## 3. Tokens

### The twelve steps

Every theme supplies a neutral ramp (`--ark-gray-1..12`) and an accent ramp
(`--ark-accent-1..12`), plus alpha variants (`--ark-gray-a1..a12`). The step
roles are fixed:

| Step | Role |
|---|---|
| 1 | app background |
| 2 | subtle / surface background |
| 3 | element background (rest) |
| 4 | element background (hover) |
| 5 | element background (pressed / selected) |
| 6 | subtle border, separator |
| 7 | element border |
| 8 | strong border, focus ring |
| 9 | solid fill (the accent proper) |
| 10 | solid fill, hovered |
| 11 | low-contrast text |
| 12 | high-contrast text |

### The rule

**Components use semantic tokens. Only `tokens.css` uses raw steps. Nothing
uses a hex value.**

```css
/* yes */
.my-thing { background: var(--ark-bg-element); border: 1px solid var(--ark-border); }

/* no — works in one theme, breaks in the other seven */
.my-thing { background: #222221; border: 1px solid #3b3a37; }

/* no — a step is a raw material, not a role */
.my-thing { background: var(--ark-gray-3); }
```

A unit test enforces the last two for `tokens.css` and every primitive
stylesheet, with `#fff` on a solid danger/accent fill as the one exception.

The semantic names are grouped as surfaces (`--ark-bg-*`), borders
(`--ark-border*`), text (`--ark-text*`), accent (`--ark-accent-*`), status
(`--ark-success-*`, `--ark-warning-*`, `--ark-danger-*`, `--ark-info-*`), and
the non-colour ramps: `--ark-space-1..12`, `--ark-radius-1..5`,
`--ark-control-xs..xl`, `--ark-text-1..8`, `--ark-shadow-1..4`,
`--ark-duration-1..3`, `--ark-z-*`. Read `css/tokens.css`; it is the reference
and it is commented.

### One surface name that is not a surface

`--ark-bg-overlay` is the **scrim** a dialog lays over the page
(`--ark-black-a9`), not the background of something that floats. Reach for it
for a floating panel and the two light themes render a dark box with dark text.
The background of a panel is `--ark-bg-raised`; `--ark-bg-surface` for the
window behind it. Phase 3 shipped this bug into a debug overlay and only a
screenshot caught it.

### Status colours never follow the accent

A danger state has to read as danger in every theme. Per-theme danger colours
are how you end up with a green "your character died" tag in the forest theme.

### The categorical data palette

`--ark-data-1..6` (`-text`, `-bg`, `-border`, `-solid`, plus `--ark-data-muted`)
colour game **data** so it can be told apart: the date column from the state
column from the count column, one chart series from the next. They are generated
from Radix like the status hues, so every theme gets them for free.

**They carry no ranking.** Slot 5 is not worse than slot 2, it is merely not
slot 2. Anything that ranks — good / middling / bad — is a *status* and belongs
on `--ark-success/warning/danger`, which is what keeps it reading correctly in
all eight themes.

**Distinguishable is not the same as prominent.** Slot 4 is a muted brown in
every theme (`#d4b3a5` dark, `#7d5e54` light) and it sits close to ordinary body
text, most visibly in the light ones. It tells apart a column perfectly well; it
is the wrong home for a mark that has to catch the eye. Slots 1, 3, 5 and 6 stay
loud in both directions, and four is as many loud categories as this palette
gives you. Phase 3 PR 4 put a "next target" marker on slot 4 and lost it against
plain text in parchment.

They are numbered rather than named after their hue, and that is deliberate. A
slot called `--ark-data-tomato` invites the next person to reach for it when
they mean danger, and one commit later the palette is a second, unpoliced status
layer. The set also avoids `grass`, `amber` and `tomato` outright, so a data
colour never reads as the status colour sitting next to it.

> **Where this came from.** The stock client carried sixteen `--popup-data-*`
> variables, hand-tuned in each of seven themes — 112 values maintained by hand.
> `themes/bridge.css` deliberately left them alone and wrote "Phase 3 decides
> their fate". Phase 3 audited all 71 uses and found they were not one thing:
> a good/middling/bad triple (`spring-green` / `yellow` / `tomato`, used for
> resistances and kill rates) that was status wearing a data costume, and a
> genuinely categorical remainder. The triple went to the status roles; the
> remainder became this palette. Nothing was left on the old layer, which is
> what lets `bridge.css` eventually die. See `UI_MIGRATION.md` §4, Phase 3.

---

## 4. Theming

A theme is a `data-ark-theme` attribute plus the `.ark-root` class:

```html
<div id="root" class="ark-root" data-ark-theme="arkadia">
```

`.ark-root` is the opt-in boundary. Everything outside it is untouched by the
system — which is what lets this load next to Bootstrap while screens migrate.

### Adding a theme

Add an entry to `src/ui/design/themes/themes.config.mjs`:

```js
{ id: 'ember', label: 'Zar', appearance: 'dark', gray: 'mauve', accent: 'tomato' }
```

then run `yarn build:design-tokens` and add the same id/label/appearance to
`THEME_CATALOG` in `themes/theme.ts`. That is the whole change: no component
touches a colour, so none of them need to know. A test fails if the generated
file or the TypeScript catalogue drifts out of step.

The eight shipped themes: `arkadia` (default), `dark-neutral`, `fantasy`,
`forest`, `icy`, `gray`, `parchment` (light), `silver` (light).

### The player's own colour

`applyTheme(element, { theme: 'custom', customColor: '#58b0e8' })` builds a full
twelve-step ramp from one seed at runtime and installs it as a single `<style>`
element. Nothing downstream can tell it apart from a generated theme — same
custom properties, same step semantics — including contrast text, which flips to
near-black for a bright accent.

---

## 5. Typography

IBM Plex Sans for UI, IBM Plex Mono for log text, timestamps and numbers
(tabular figures). Loaded from Google Fonts by the entry HTML of pages that use
the system.

> If a new entry point adds that `<link>`, add it to the route-blocking pattern
> in `e2e/support/fixtures.ts` and `firebase-fixtures.ts` — the e2e suite blocks
> external requests, and an unblocked font request stalls page load.

---

## 6. Using it

```tsx
// once, in the entry point — never from the component barrel
import "@design/css/index.css";
// (One deliberate exception: src/web/settings/SettingsDialog.tsx imports it
//  itself, because forge lazy-imports that component into a shell that has no
//  entry point of ours. See UI_MIGRATION.md Phase 4.)

import { Button, Dialog, Icon, Input, Toggle } from "@design";
```

Primitives available: `Badge`, `Button`/`IconButton`, `Callout`/`EmptyState`,
`Checkbox`, `Chip`, `Dialog` (+ header/body/footer/close), `Field`, `Icon`,
`Input`/`InputShell`, `Kbd`, `Row`/`Col`/`Spacer`/`Divider`, `Menu`,
`Segmented`, `Select`, `Spinner`, `Switch`, `Table` (+ scroll/row/cell),
`Tabs`, `Toggle`, `Tooltip`.

### Conventions

- **`solid` is for one action per view.** If every button is the accent colour,
  the accent colour stops meaning anything. Default to `soft`.
- **Icons go through `Icon`, by meaning** (`name="jump-start"`), not by importing
  from `lucide-react` directly. Swapping an icon is then a one-file change.
- **Icon-only buttons take a `title`** with the shortcut spelled out
  (`"Zamknij  Esc"`). This project does not use `aria-*` attributes (AGENTS.md),
  so `title` is both the accessible name and the tooltip.
- **UI text is Polish**, ASCII-only, like the rest of the client.

### The specificity trap

It runs both ways. Inside the system, `base.css` wraps its element resets in
`:where()` so they carry **zero** specificity. Without that, `.ark-root button { padding: 0 }` (0,1,1) outranks
`.ark-button--solid` (0,1,0) and every button in the system renders as bare
text. If you add to the reset, keep it inside `:where()`.

The mirror image bites when the system loads inside a screen that has its own
bare-element rules. `src/web/style.css` skins `button`, and Radix builds
`Checkbox`, `Switch`, `Toggle`, `Segmented`, `Tabs` and the `Select` trigger out
of `<button>`. A bare `button` (0,0,1) loses to `.ark-checkbox` (0,1,0) only for
the properties that class declares — `padding`, `opacity`, `border-radius` and
`min-width` are not among them, so the checkbox rendered as a 60px translucent
pill. `style.css` now excludes `ark-`-prefixed classes from those rules, with
the exclusion inside `:where()` so nothing else changes.

---

## 7. What is migrated

| Screen | State |
|---|---|
| `log-viewer/` (standalone log browser) | **on the design system**, no Bootstrap |
| `design/` (showcase) | on the design system |
| Logi window (`src/web/LogBrowser.tsx`, `LogManager.tsx`) | **on the design system**, in a `Dialog` inside the stock client (Phase 2, PR 2) |
| `src/web/` combat + status popups (9) | **on the design system**, `--ark-*` only (Phase 3, PR 1) |
| `src/web/` world + time popups (6) | **on the design system**, `--ark-*` only (Phase 3, PR 2). Okno mapy is not among them — see `UI_MIGRATION.md` §4 |
| `src/web/` travel + transport popups (7) | **on the design system**, `--ark-*` only (Phase 3, PR 3) |
| `src/web/` debug + misc popups (3) | **on the design system**, `--ark-*` only (Phase 3, PR 4). Okno mapy is still not among them — see `UI_MIGRATION.md` §4 |
| `src/web/popups/popups-base.css` Layer 2 (shared popup chrome) | **on the design system**, `--ark-*` only |
| `src/web/settings/` (the settings dialog shell) | **on the design system** (Phase 4, PR 1) |
| `src/web/` settings pages | migrating one page per PR; done: Komendy, Inne, Gildie, Magiki (Faza 4, PR 1), Okna, Wyglad, Mapa, Dzwiek i powiadomienia (PR 2) |
| `src/web/` remaining popups, settings, layout | Bootstrap markup; `--popup-*` bridged onto `--ark-*` (`themes/bridge.css`), so it themes from here |
| `forge-ui/` | out of scope by decision; its own theme layer |
| `editor/`, `viewer/`, `popup/` | Bootstrap |

### Migrating a screen

1. Wrap its root in `.ark-root` with a `data-ark-theme`.
2. Import `@design/css/index.css` in that entry (once).
3. Replace react-bootstrap components with `@design` primitives.
4. Replace `--popup-*` reads with semantic tokens.
5. Drop the screen's Bootstrap imports when nothing in it needs them.

### Living inside the stock client

The first screen to do this (the Logi window) turned up two things that a
standalone page never shows, and every later screen inherits both.

**The stock cascade reaches in.** `.ark-root` is on `<body>`, and the system's
element reset is wrapped in `:where()` so primitives can win — which means a
bare `button { … }` rule in `style.css`, loaded after the system, outranks
every primitive that does not set that property. It silently gave every
control `opacity: 0.75` and `padding: 0.75vh 2vw` (a 16px checkbox came out
53px wide). That rule is now guarded with
`button:where(:not([class^='ark-'], …))` — same specificity, no reach. When a
new screen migrates, check it renders *in the client*, not only in the
showcase.

**The z tokens are absolute, not relative.** `--ark-z-overlay` and friends are
five-digit numbers because the stock client's own stack runs to 10100 (the
output context menu); a dialog below that has the mobile keypad and the input
bar poking through it. Nested dialogs are handled by the `Dialog` component
itself: it counts its own depth through a context and writes
`--ark-dialog-level`, which `dialog.css` adds onto both z-indexes, so a dialog
opened from a dialog scrims the one underneath.

The natural next target is the popup layer — see `docs/dev/UI_MIGRATION.md`
Phase 3.

---

## 8. Commands

```bash
yarn build:design-tokens   # regenerate scales.generated.css after a theme change
yarn dev                   # then open /design/index.html for the showcase
yarn vitest run test/ui    # design system + log viewer unit tests
```

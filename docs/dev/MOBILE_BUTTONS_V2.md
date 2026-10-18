# Mobile buttons v2: data model and migration

Status: phases 1 (model, migration, mirror) and 2 (editor: modes,
inheritance, Edytuj, Układ, background, style chips) implemented; the Style
tab and Zaznacz (phase 3) not yet.

Phase 2 deviations from the mockup: Rozmiar/Odstęp stay visible under the
panel in both tools rather than inside Układ; the Układ tool uses the +/− on
the grid edges, without extra steppers; "Domyślne" on Drużyna/Prowadzący is
"Dziedzicz wszystko" (clears the mode's own buttons, layout and background).
Mockup (phone + desktop, interactive): https://claude.ai/artifact/D347XfT8c7wyVKZx5i8wYH

## Why

Today `mobileButtonSettings` holds three full, independent copies of the grid
(`solo`, `team`, `leader` — buttons, order, cols, background each). A change
that should apply everywhere has to be made three times, "Kopiuj układ z"
overwrites the whole target, and colour syncing is a special case:

- "Synchronizuj kolory kierunków" is editor-only state (never saved), touches
  only `kierunek` buttons, and writes all three modes while every other edit
  writes one.
- `specialExit` has its own `syncWithDirections` flag, resolved at render time
  from the first `kierunek` button of the active set.
- No way to change several buttons at once.

## Concepts

- **Solo is the base.** Drużyna inherits from Solo, Prowadzący inherits from
  Drużyna (`leader → team → solo`, a leader is in a team).
- **Inheritance is by button id, not by position.** A mode stores only the
  buttons it overrides, whole-button (action, label, hold, style — no
  per-field overrides).
- **Grid shape is inheritable too.** A mode either inherits its parent's
  layout or has its own (`cols` + `order`). With its own layout it can move,
  drop or add slots; slot content still resolves by id through the chain.
- **Panel background** is inheritable the same way.
- **Styles** are a shared palette (`color`, `fontColor`, `activeColor`).
  Buttons reference a style by id; there are no per-button colours. A
  one-off colour is a style used by one button ("+ Nowy styl" in the editor).
- **Empty slots are buttons** (`macroType: 'empty'`), so a team can fill a
  base empty slot by overriding it, without forking the layout.

## Storage shape

Same key, `mobileButtonSettings` (global, synced). New shape is tagged with
`version: 2`.

```ts
type Mode = 'solo' | 'team' | 'leader';

const PARENT: Record<Mode, Mode | null> = { solo: null, team: 'solo', leader: 'team' };

interface MobileButtonStyle {
    name: string;
    color: string;       // background, any CSS colour the colour input produces
    fontColor: string;
    activeColor: string; // used by kierunek / specialExit when the exit is available
}

/** A button as stored: today's MobileButtonSetting minus the colour fields. */
interface StoredMobileButton extends ButtonMacroConfig {
    label: string;
    style?: string;      // style id; missing/unknown → first entry of styleOrder
    holdEnabled?: boolean;
    hold?: ButtonMacroConfig;
}

interface GridLayout {
    cols: number;
    order: string[];     // button ids, row-major, length is a multiple of cols
}

interface ModeConfig {
    buttons: Record<string, StoredMobileButton>; // solo: full set; team/leader: overrides + local slots
    layout?: GridLayout;    // required on solo; absent = inherit
    background?: string;    // rgba() string as today; required on solo; absent = inherit
}

interface MobileButtonSettingsV2 {
    version: 2;
    modes: Record<Mode, ModeConfig>;
    styles: Record<string, MobileButtonStyle>;
    styleOrder: string[];   // chip order in the editor; never empty
    // unchanged, shared by all modes:
    locked: boolean;
    buttonSize?: number;
    buttonGap?: number;
    radial: RadialSettings;
    joysticks: JoystickSettings;
    // transition only, see "Compatibility":
    solo?: LayoutSettings;
    team?: LayoutSettings;
    leader?: LayoutSettings;
}
```

Notes:

- `modes` (not top-level `solo/team/leader`) is deliberate: an old client's
  `loadSettings` checks `raw.solo.buttons` first, so v2 data never parses as
  v1 by accident.
- Style ids and new button ids are generated (`style-<n>`, `button-<n>`, `n`
  = max existing + 1 across **all** modes, so an id never means two different
  buttons in two modes unintentionally).
- Positions (`mobileButtonsPosition`) are untouched.

## Resolution (pure, `src/web/mobileButtons/resolve.ts`)

```ts
resolveButton(s, mode, id): { button: StoredMobileButton; source: Mode } | null
    // walk mode → PARENT until modes[m].buttons[id] exists
resolveLayout(s, mode): { layout: GridLayout; source: Mode }
resolveBackground(s, mode): { background: string; source: Mode }
styleOf(s, button): MobileButtonStyle   // unknown id → styles[styleOrder[0]]

/** What the renderer needs — exactly today's LayoutSettings. */
resolveMode(s, mode): LayoutSettings
    // order/cols from resolveLayout, background from resolveBackground,
    // buttons = for each id in order: { ...button, color, fontColor, activeColor } from its style
```

`resolveMode` returns v1's `LayoutSettings` with `MobileButtonSetting`
values, so:

- `MobileDirectionButtons` changes one line (`activeSet` = `resolveMode(...)`
  for the current mode) and `computeButtonVisual` drops the
  `syncWithDirections` branch (special exits now just use their style).
- Plugins keep receiving a `MobileButtonSetting` (with colours) in
  `onClick(button, …)`; the plugin API surface does not change.
- `applySettings` keeps emitting `mobileButtonsSettings` with the resolved
  buttons.

Derived editor state, also pure:

- `isOverride(mode, id)` — stored in `mode`, and the parent chain resolves it.
- `isLocal(mode, id)` — stored in `mode`, parent chain does not resolve it,
  and it is not empty.
- `hiddenIds(mode)` — ids that resolve to a non-empty button in `mode` but are
  not in its resolved layout ("Poza układem").
- `ownCount(mode)` — overrides + local (the tab badge).

## Editing operations (`src/web/mobileButtons/ops.ts`, pure, return new settings)

All ops take `(settings, mode, …)` and never mutate. "Fork" = copy the
resolved value into `mode`.

| Op | Behaviour |
|----|-----------|
| `setButton(mode, id, patch)` | forks the button into `mode` if it is inherited, then applies `patch`. Switching `macroType` to `empty` clears label and style; switching away from empty fills a default label and style (`kierunek` → the directions style if present). |
| `restoreButton(mode, id)` | deletes `modes[mode].buttons[id]` when the parent chain resolves it; no-op on solo. |
| `clearSlot(mode, id)` | stores an empty button in `mode`. |
| `setLayoutInherited(mode, bool)` | `false` forks the resolved layout; `true` deletes `modes[mode].layout` (local buttons not in the parent layout become hidden, not deleted). |
| `swapSlots(mode, i, j)` | forks layout, swaps. |
| `addRow/removeRow(mode, 'top'\|'bottom')`, `addCol/removeCol(mode, 'left'\|'right')` | forks layout; new slots are fresh empty buttons stored in `mode`; removing drops ids from `order` and deletes them only if they are local empties. Minimum 1×1. |
| `placeHidden(mode, id)` | forks layout, puts `id` in the first empty slot, else appends a row. |
| `setBackground(mode, value)` / `restoreBackground(mode)` | fork / delete `modes[mode].background`. |
| `assignStyle(mode, ids, styleId)` | for each non-empty id whose style differs: fork into `mode`, set style. Returns the counts (changed, forked) for the toast. |
| `addStyle(from?)`, `updateStyle(id, patch)`, `deleteStyle(id)` | delete reassigns every button using it (in all modes) to `styleOrder[0]`; the last style cannot be deleted. |
| `newStyleForButton(mode, id)` | copies the button's style under a new id named `Styl: <label>`, assigns it to the button (forking if inherited). |

Editing an inherited button forks it (Figma-instance style). The editor makes
that visible: amber dot on the cell, "Własny w trybie …" card, "Przywróć".

## Defaults

`createDefaultSettings()`:

- `styles`: `podstawowy` (`#6EB4DC`, `defaultFontColor`, `#2fa7c5`) and
  `kierunki` (`#6CA6CD`, `defaultFontColor`, `#2fa7c5`), in that order.
- `modes.solo` = today's `defaultSettings` / `defaultOrder` / `defaultCols` /
  `defaultBackground`, top row on `podstawowy`, directions + `c-button` +
  `special-exit-button` on `kierunki`.
- `modes.team` and `modes.leader` = `{ buttons: {} }`.

Unlike v1, defaults are **not** merged into stored buttons on load. v1's
`mergeMobileButtonSettings` adds every default id to every layout; in v2 that
would resurrect removed defaults as "Poza układem". The migration materialises
what is placed; after that the stored data is authoritative.

## Migration v1 → v2 (`src/web/mobileButtons/migrateV1.ts`)

Input: the raw stored value. Run it through today's normalisation first
(`migrateMobileButtonMacroData`, `migrateZerknijButtonMacroData`, then v1
`loadSettings` parsing incl. the legacy flat format), so the migration only
ever sees the canonical v1 `Settings`.

1. **Effective colours per placed button**, per layout. For `specialExit`
   with `syncWithDirections`, take colour/activeColor from the first
   `kierunek` button of the same layout (what the renderer does today).
   `activeColor` only counts for `kierunek`/`specialExit`; for other
   buttons treat it as "any".
   Plugin state colours are runtime-only and are ignored.
2. **Styles.** Normalise colours (lower-case hex, `rgba()` whitespace), group
   placed non-empty buttons of all three layouts by `(color, fontColor)`,
   splitting a group if its direction buttons disagree on `activeColor`;
   non-direction buttons take the group's active colour (or `#2fa7c5`).
   Naming: a group made only of `kierunek`/`specialExit`/`zerknij` buttons →
   "Kierunki"; the group holding the default top-row colour → "Podstawowy";
   the rest "Styl 1", "Styl 2"… in order of first appearance (solo, then
   team, then leader, row-major). Ids `style-1…`. `styleOrder` = that order.
3. **Solo.** `layout` = solo `{cols, order}`; `background` = solo background;
   `buttons` = solo buttons **for placed ids only**, colours replaced by the
   style id. Unplaced v1 ids (default ids the user removed, leftovers from
   removed rows) are dropped — they were unreachable in v1.
4. **Team** against resolved solo, then **leader** against resolved team (so
   a button identical in team and leader but different from solo is stored
   once, in team):
   - `layout`: omitted if `cols` and `order` equal the parent's resolved
     layout, else copied.
   - `background`: omitted if equal to the parent's resolved one.
   - `buttons`: for each id in this layout's order, compare the stored button
     (after colour → style) with the parent's resolved button by value
     (`macroType`, `label`, `command`, `direction`, `enemySlot`, `exitIndex`,
     `pluginConfig`, `steps`, `holdEnabled`, `hold`, `style`; missing ≡
     `undefined`). Store it only if different or unresolved in the parent.
5. Drop `syncWithDirections`, `color`, `fontColor`, `activeColor` from all
   stored buttons. Carry over `locked`, `buttonSize`, `buttonGap`, `radial`,
   `joysticks` unchanged.

Properties the tests must pin:

- Idempotent: v2 input is returned unchanged.
- Lossless for what a user could see: for every mode,
  `resolveMode(migrate(v1), mode)` renders the same order, cols, background,
  labels, actions and colours as v1's layout for that mode.
- Default v1 data → 2 styles, team and leader `{ buttons: {} }`.
- Garbage / partial input → `createDefaultSettings()` (same tolerance as
  `loadSettings` today).

### Where it runs

- **On read** (`loadSettings`): no `version: 2` → migrate in memory. This is
  the self-heal path for v1 data arriving later from sync, a device bundle or
  an old backup.
- **Startup pass**: `migrateMobileButtonsToV2()` in `mobileButtonSettings.ts`,
  called from `clientBootstrap` right after the v1 field renames it relies
  on. It is idempotent (skips v2 data), so it is not gated by the
  migrations version counter. Before the first write it copies the raw v1
  value to the plain localStorage key `mobileButtonSettingsV1Backup` (not a
  schema key, so never synced or exported), once, so a bad conversion can be
  rolled back by hand.
- **Import** (`migrateImportedValue`) does **not** convert: it lives in
  `@modules/core` and the model lives in `@web`. Imported v1 values are
  converted by the read path the moment anything loads them, and persisted
  on the next save or startup.
- **`buttons` category import** (`exportUtils.ts`): it currently shallow-merges
  `{ ...existing, ...incoming }`. With v2 existing + v1 incoming that would
  keep `version: 2`/`modes` from existing and silently ignore the incoming
  layouts. Fix: migrate `incoming` to v2 first, then take `modes`, `styles`,
  `styleOrder` (and the transition mirror) from incoming, keeping
  `radial`/`joysticks` from existing as today. The `radial` category merge
  only sets `radial` and stays as is.
- Device bundles (`deviceSettingsBundle`, `deviceStorage`) go through
  `loadSettings` / `saveSettings` and need only the type change.

## Compatibility with clients still on v1

The app is served from Pages, so old code only lives in stale tabs and cached
PWAs, but those still sync. Without care, an old client reads v2 as "no
layouts", shows defaults, and its next save pushes defaults back to every
device.

Transition mirror: for a few releases `saveSettings` also writes top-level
`solo`, `team`, `leader` = `resolveMode(s, mode)` (v1 `LayoutSettings`, full
buttons with colours). Effects:

- An old client reads the mirror and shows the right buttons.
- If it saves, it writes v1 (it drops `version`/`modes`/`styles`). New
  clients see no `version: 2` and re-migrate: the old client's edits survive,
  v2-only structure (style names, which buttons were overrides) is
  re-derived, which the lossless property makes visually identical.
- v2 readers ignore the mirror whenever `version === 2`.

In memory the views are always there: `Settings` extends the v1 shape, so
the renderer, the radial menu and the current editor keep reading
`settings.solo/team/leader` unchanged. `saveSettings` compares the views
with `resolveMode(modes)`; if a caller edited a view (the current editor, a
v1 object from a device bundle) it re-derives `modes` from the views with
`modesFromLayouts(views, existingStyles)`, which reuses a style's id and name
where its colours still match and drops styles nothing uses any more.
Colours are stored lower-cased and without whitespace.

Remove the mirror (and the v1 branch of `computeButtonVisual`) once telemetry
or a few months make stale clients unlikely; keep `migrateV1` itself
indefinitely for backups.

Size: the mirror roughly doubles the value; still a few tens of KB at most,
fine for localStorage and the Firebase document.

## Editor (`src/web/options/MobileButtons.tsx`, rewritten)

Follows the mockup. One component, two layouts switched at the existing 768px
breakpoint:

- Mode tabs (`Segmented`) Solo / Drużyna / Prowadzący with an own-count
  badge; under them the chain ("Prowadzący ← Drużyna ← Solo") and a summary
  ("2 własne · układ własny 5×5").
- Live preview grid (real button size, scaled down to fit). Inherited cells
  dimmed, overrides/local with an amber dot. On phone the grid shrinks while
  a button is being edited and a grab bar can give the panel the full height.
- Tools: Edytuj / Zaznacz / Style / Układ — bottom bar on phone, toolbar above
  the grid on desktop; the panel sits under the grid on phone, in a 400px
  right column on desktop.
  - **Edytuj**: inheritance card (base / inherited → "Edytuj w …" / own →
    "Przywróć" / local), Akcja, Etykieta, style chips + "+ Nowy styl",
    inline style colours with a "used by N buttons" warning, hold config,
    macro config (existing `MacroConfigEditor`, `HoldConfig`).
  - **Zaznacz**: count, "Nadaj styl", Nadpisz / Przywróć / Opróżnij, then
    "Zaznacz szybko" (Wszystkie, Kierunki, per style). Ctrl/Shift+click on
    desktop multi-selects from any tool.
  - **Style**: palette list with counts, expandable colour editors; while a
    style is open, tapping cells assigns it.
  - **Układ**: inherit/own toggle, +/− on all four grid edges and as
    steppers, tap-two-to-swap, "Poza układem" chips, panel background
    (colour + krycie, inheritable), and the shared Rozmiar / Odstęp.
- Removed: "Kopiuj układ z", "Synchronizuj kolory kierunków",
  `syncWithDirections` checkbox.
- Kept: Domyślne (resets the current mode — solo to defaults, team/leader to
  "inherit everything"), Resetuj pozycje, Zablokuj, save via `registerSave`.

## Code map

| File | Change |
|------|--------|
| `src/web/mobileButtons/model.ts` (new) | v2 types, `PARENT`, `createDefaultSettings` |
| `src/web/mobileButtons/resolve.ts` (new) | resolution + derived editor state |
| `src/web/mobileButtons/ops.ts` (new) | editing operations |
| `src/web/mobileButtons/migrateV1.ts` (new) | v1 → v2 |
| `src/web/mobileButtonSettings.ts` | `loadSettings` → v2 (migrating on read), `saveSettings` writes the mirror, `applySettings` emits resolved buttons; v1 types kept for the mirror and migration |
| `src/web/buttonSettings.ts` | `MobileButtonSetting` unchanged (renderer/plugin type); drop `syncWithDirections` after the mirror goes |
| `src/ui/web/buttons/MobileDirectionButtons.tsx` | `activeSet` via `resolveMode`; drop `syncWithDirections` branch |
| `src/ui/web/buttons/MobileCommandRadial.tsx`, `MobileJoysticks.tsx` | type only (radial/joysticks unchanged) |
| `src/web/options/MobileButtons.tsx`, `ButtonGrid.tsx` | rewritten editor |
| `src/web/clientBootstrap.ts` | call `migrateMobileButtonsToV2` |
| `src/web/options/exportUtils.ts` | `buttons` category merge fix |
| `src/modules/core/storageSchema.ts` | none: `Settings` is now the v2 type |
| `src/modules/device/*` | type only |

## Tests

Unit (`test/web/mobileButtons/`):

- `migrateV1.test.ts`: defaults; identical copies → no overrides; one changed
  team button → one override; leader same as team ≠ solo → stored once in
  team; different cols/order → own layout; background inheritance; colour
  grouping and naming; diverging activeColor splits a group;
  `syncWithDirections`; unplaced ids dropped; legacy flat format and `macro`
  field; garbage input; idempotency; the lossless property over a few fixture
  sets (compare `resolveMode` with v1 layouts).
- `resolve.test.ts`: chain walk, layout/background inheritance, unknown style
  fallback, `hiddenIds`, `ownCount`.
- `ops.test.ts`: fork-on-edit, restore, layout fork on first layout edit,
  add/remove at each side keeps ids and deletes only local empties, swap,
  placeHidden with and without a free slot, assignStyle counts, deleteStyle
  reassignment, last style undeletable, `newStyleForButton`.
- `test/web/mobileButtonSettings.test.ts`: read-time migration, startup pass
  and backup, save keeping vs re-deriving modes, v1 objects, broken v2.
- `test/web/exportImport.test.ts`: `buttons` import of v1 into a v2 store.

E2E:

- `mobile-button-migration.spec.ts`: seed v1 (three different layouts), load,
  assert rendered buttons per team state and that storage is v2 + backup.
- `mobile-buttons-color.spec.ts`: rewrite around styles (the sync checkbox is
  gone): change a style, every button using it changes in every mode.
- New `mobile-buttons-inheritance.spec.ts`: edit in solo shows in team; edit in
  team creates an override (dot), Przywróć removes it; own layout in leader.
- `mobile-buttons-sizing.spec.ts`, `compound-macro-mobile.spec.ts`,
  `attack-all-button.spec.ts`, `direction-bindings.spec.ts`: adjust selectors
  to the new editor; renderer DOM contract (`#mobile-direction-buttons`, ids,
  classes) must not change.

## Rollout

1. Model, resolver, migration, mirror, renderer switch. The old editor keeps
   working unchanged on the v1 view: it loads the three `resolveMode` layouts
   and saves by running `migrateV1` on what it edited. Nothing is
   user-visible yet; style names are re-derived on every save, which is fine
   while styles cannot be edited.
2. New editor: modes + inheritance, Edytuj, Układ, background, style chips +
   "+ Nowy styl".
3. Style tab, Zaznacz, desktop two-column layout.
4. After the transition window: drop the mirror and `syncWithDirections`.

## Open questions

- Should "Domyślne" on team/leader mean "inherit everything" (proposed) or
  "copy defaults as overrides"?
- "Poza układem" can get long when a team layout was built from different ids
  in v1; collapse it behind a count, or offer "Usuń z trybu" for local ones?
- Do we want per-style "copy to new" in the Style tab, or is
  "+ Nowy styl" from a button enough?

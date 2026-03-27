# Button Settings Unification

Unify mobile and desktop button settings to share types, constants, and UI components.

## Problem

MobileButtons.tsx (1327 lines) and DesktopButtons.tsx (1213 lines) duplicate significant functionality:
- Macro options list (~identical)
- Macro select dropdown with plugin grouping (repeated ~6x per file)
- Compound steps editor (reorder, delete, add, per-step macro config)
- Hold action config (toggle, warning, nested macro config)
- Plugin config fields (text/textarea/number/select/checkbox)
- Plugin state labels/colors
- Direction options constant

The data models are nearly identical but use different field names (`macro` vs `macroType`) and separate type hierarchies.

## Design

### 1. Data Model Unification

**New file: `src/web/buttonSettings.ts`**

Shared types and constants consumed by both mobile and desktop settings modules.

```ts
// Moved from mobileButtonSettings.ts
export type MacroType =
    | 'functional' | 'zList' | 'zaList' | 'wList' | 'przeList' | 'idzList'
    | 'command' | 'specialExit' | 'kierunek' | 'wesprzyj' | 'moveMode'
    | 'toggleButtons' | 'attackEnemy' | 'blockEnemy' | 'attackAllEnemies'
    | 'mute' | 'unmute' | 'empty' | 'compound';

export interface ButtonMacroConfig {
    macroType: MacroType | string;
    command?: string;
    direction?: string;
    enemySlot?: number;
    pluginConfig?: Record<string, any>;
    steps?: ButtonMacroConfig[];
}

export interface BaseButtonSetting extends ButtonMacroConfig {
    label: string;
    color: string;
    fontColor?: string;
    holdEnabled?: boolean;
    hold?: ButtonMacroConfig;
}

export interface MobileButtonSetting extends BaseButtonSetting {
    activeColor?: string;
    syncWithDirections?: boolean;
}

export interface DesktopButtonSetting extends BaseButtonSetting {
    id: string;
    command: string;       // required override
    fontColor: string;     // required override
    fontSize: number;
    width: number;
    height: number;
    x: number;
    y: number;
    backgroundOpacity: number;
    listPosition?: ListPosition;
    listGrowDirection?: ListGrowDirection;
    listCloseOnlyByButton?: boolean;
}

// Moved from desktopButtonSettings.ts
export type ListPosition = 'top' | 'bottom' | 'left' | 'right';
export type ListGrowDirection = 'horizontal' | 'vertical';

// Shared constants
export const defaultFontColor = '#f1f5f9';

export const directionOptions = ["nw","n","ne","w","e","sw","s","se","u","d"] as const;

export const macroOptions: { value: MacroType; label: string }[] = [
    { value: "functional", label: "Bind funkcyjny" },
    { value: "zList", label: "Lista /z" },
    { value: "zaList", label: "Lista /za" },
    { value: "wList", label: "Lista /w" },
    { value: "przeList", label: "Lista /prze" },
    { value: "idzList", label: "Lista idz" },
    { value: "command", label: "Wyślij komendę" },
    { value: "kierunek", label: "Kierunek" },
    { value: "specialExit", label: "Wyjście specjalne" },
    { value: "wesprzyj", label: "Wesprzyj prowadzącego" },
    { value: "moveMode", label: "Tryb ruchu" },
    { value: "toggleButtons", label: "Przełącz przyciski" },
    { value: "attackEnemy", label: "Atakuj wroga" },
    { value: "blockEnemy", label: "Zablokuj wroga" },
    { value: "attackAllEnemies", label: "Atakuj wszystkich wrogów" },
    { value: "mute", label: "Wycisz dźwięki" },
    { value: "unmute", label: "Włącz dźwięki" },
    { value: "compound", label: "Złożone (wiele akcji)" },
    { value: "empty", label: "Puste" },
];
```

**`src/web/mobileButtonSettings.ts`** — keeps mobile-specific logic:
- `LayoutSettings`, `Settings`, `RadialSettings`, `RadialCommandSetting` types
- Default mobile buttons/order/cols/background
- `loadSettings()`, `saveSettings()`, `applySettings()`
- `parseLayout()`, `mergeButtonSettings()`, `extractButtons()`
- Background helpers: `extractAlpha()`, `computeBoxShadow()`
- Imports and re-exports `MacroType`, `ButtonMacroConfig`, `MobileButtonSetting` from `buttonSettings.ts`
- Renames internal `ButtonSetting` → `MobileButtonSetting`

**`src/web/desktopButtonSettings.ts`** — keeps desktop-specific logic:
- `DesktopButtonsSettings` type
- Desktop defaults (defaultButtonColor, defaultFontSize, defaultWidth, etc.)
- `loadSettings()`, `saveSettings()`, `applySettings()`
- `createDefaultButton()`, `createDefaultSettings()`
- `parseButton()`, `parseDesktopSteps()`, `parseHoldConfig()`
- `hexToRgba()`
- Removes `DesktopButtonMacroConfig` — uses `ButtonMacroConfig` instead
- Imports `DesktopButtonSetting` from `buttonSettings.ts`

### 2. Shared UI Components

**`src/web/options/MacroSelect.tsx`**

Reusable macro dropdown with plugin optgroup support.

```ts
interface MacroSelectProps {
    value: string;
    onChange: (value: string) => void;
    pluginMacros: PluginButtonMacro[];
    filter?: (opt: { value: MacroType; label: string }) => boolean;
    showUnavailableWarning?: boolean;
    className?: string;
}
```

Renders `<Form.Select>` with:
- Built-in macro options (filtered if `filter` provided)
- Plugin macros grouped by plugin name
- Unavailable plugin fallback option when applicable

**`src/web/options/MacroConfigEditor.tsx`**

Renders macro-type-specific configuration fields.

```ts
interface MacroConfigEditorProps {
    config: ButtonMacroConfig;
    onChange: (updates: Partial<ButtonMacroConfig>) => void;
    pluginMacros: PluginButtonMacro[];
}
```

Handles:
- `command` → textarea input
- `kierunek` → direction select
- `attackEnemy`/`blockEnemy` → enemy slot select
- `compound` → compound steps editor (internal, not exported)
  - Each step: MacroSelect + recursive macro-specific fields
  - Reorder (up/down), delete, add step controls
- `plugin:*` → plugin config fields (text/textarea/number/select/checkbox) + state labels/colors

The compound steps editor is an internal component within this file, not separately exported, since it's only used here.

**`src/web/options/HoldConfig.tsx`**

Hold (tap-and-hold) action configuration section.

```ts
interface HoldConfigProps {
    holdEnabled: boolean;
    hold: ButtonMacroConfig | undefined;
    onToggle: (enabled: boolean) => void;
    onChangeHold: (updates: Partial<ButtonMacroConfig>) => void;
    pluginMacros: PluginButtonMacro[];
    locked: boolean;
    idSuffix: string;
}
```

Renders:
- Hold toggle checkbox
- Warning about unlocked buttons conflicting with hold (when `!locked`)
- MacroSelect for hold macro type
- MacroConfigEditor for hold-specific config

### 3. Integration

**`MobileButtons.tsx`** changes:
- Imports types from `buttonSettings.ts`
- Removes local `macroOptions`, `directionOptions`
- Uses `<MacroSelect>`, `<MacroConfigEditor>`, `<HoldConfig>`
- Keeps mobile-specific UI: grid layout, mode tabs, background picker, button size/gap, spatial controls, direction sync, appearance section

**`DesktopButtons.tsx`** changes:
- Imports types from `buttonSettings.ts`
- Removes local `macroOptions`, `directionOptions`
- Uses `<MacroSelect>`, `<MacroConfigEditor>`, `<HoldConfig>`
- Keeps desktop-specific UI: button list, preview, position/size/font inputs, background opacity, list position config

**`ButtonGrid.tsx`** changes:
- Imports `MobileButtonSetting` from `buttonSettings.ts`
- References `macroType` instead of `macro`

### 4. Migration (Version 6)

Add migration version 6 to `settingsMigrations.ts`.

**`migrateMobileButtonMacroField()`** function:
- Reads `mobileButtonSettings` from `globalStorage`
- Recursively renames `macro` → `macroType` in:
  - All button configs within each layout (solo/team/leader)
  - Hold configs (`hold.macro` → `hold.macroType`)
  - Steps arrays (`steps[].macro` → `steps[].macroType`)
  - Hold steps (`hold.steps[].macro` → `hold.steps[].macroType`)
- Saves back to `globalStorage`
- Follows the same pattern as `migrateButtonSizeMultiplier()` — no-op in the main migration callback, actual work in a separate exported function

### 5. Testing

**E2E test: `e2e/mobile-button-migration.spec.ts`**
- Seeds localStorage with old-format mobile button settings (using `macro` field)
- Loads the app
- Verifies buttons work correctly after migration
- Verifies saved settings use `macroType` field

**Existing e2e tests** — no major changes expected. The UI behavior is unchanged; only internal field names change. Tests interact via UI, not field names.

### 6. Files Changed

New files:
- `src/web/buttonSettings.ts`
- `src/web/options/MacroSelect.tsx`
- `src/web/options/MacroConfigEditor.tsx`
- `src/web/options/HoldConfig.tsx`
- `e2e/mobile-button-migration.spec.ts`

Modified files:
- `src/web/mobileButtonSettings.ts` — use `macroType`, import shared types
- `src/web/desktopButtonSettings.ts` — remove DesktopButtonMacroConfig, import shared types
- `src/web/options/MobileButtons.tsx` — use shared components
- `src/web/options/DesktopButtons.tsx` — use shared components
- `src/web/options/ButtonGrid.tsx` — use MobileButtonSetting, macroType
- `src/modules/core/settingsMigrations.ts` — add migration v6
- Other files importing from mobileButtonSettings/desktopButtonSettings may need import path updates

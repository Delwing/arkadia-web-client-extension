# Button Settings Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify mobile and desktop button settings to share types, constants, and UI components, eliminating ~1500 lines of duplicated code.

**Architecture:** Extract shared types (`ButtonMacroConfig`, `BaseButtonSetting`) and constants (`macroOptions`, `directionOptions`) into `src/web/buttonSettings.ts`. Extract shared UI components (`MacroSelect`, `MacroConfigEditor`, `HoldConfig`) into `src/web/options/`. Rename mobile's `macro` field to `macroType` everywhere with a settings migration (v6). Both `MobileButtons.tsx` and `DesktopButtons.tsx` then consume the shared components.

**Tech Stack:** React 19, TypeScript 5.8, React-Bootstrap, Jest (unit), Playwright (e2e)

---

## File Structure

**New files:**
- `src/web/buttonSettings.ts` — shared types, macro config interfaces, constants
- `src/web/options/MacroSelect.tsx` — reusable macro dropdown component
- `src/web/options/MacroConfigEditor.tsx` — macro-specific config fields + compound steps editor
- `src/web/options/HoldConfig.tsx` — hold action configuration section
- `e2e/mobile-button-migration.spec.ts` — e2e test for macro field migration

**Modified files:**
- `src/web/mobileButtonSettings.ts` — use `macroType`, import shared types, re-export for backward compat
- `src/web/desktopButtonSettings.ts` — remove `DesktopButtonMacroConfig`, import shared types
- `src/web/options/MobileButtons.tsx` — use shared components
- `src/web/options/DesktopButtons.tsx` — use shared components
- `src/web/options/ButtonGrid.tsx` — use `MobileButtonSetting`, `macroType`
- `src/web/scripts/mobileDirectionButtons.ts` — rename `.macro` → `.macroType` (20 occurrences)
- `src/web/scripts/mobileCommandRadial.ts` — update `ButtonSetting` import
- `src/modules/core/settingsMigrations.ts` — add migration v6
- `src/web/main.ts` — call new migration function
- `src/modules/core/pluginButtonMacroRegistry.ts` — update import paths
- `src/client/PluginApi.ts` — update import path
- `src/modules/device/deviceTypes.ts` — update import paths
- `src/modules/device/deviceSettingsBundle.ts` — no changes needed (imports load/save functions)
- `src/modules/core/storageSchema.ts` — update import paths
- `src/web/scripts/desktopButtons.ts` — update `DesktopButtonMacroConfig` → `ButtonMacroConfig`

---

### Task 1: Create shared types file `buttonSettings.ts`

**Files:**
- Create: `src/web/buttonSettings.ts`

- [ ] **Step 1: Create `src/web/buttonSettings.ts`**

```ts
export type MacroType =
    | 'functional'
    | 'zList'
    | 'zaList'
    | 'wList'
    | 'przeList'
    | 'idzList'
    | 'command'
    | 'specialExit'
    | 'kierunek'
    | 'wesprzyj'
    | 'moveMode'
    | 'toggleButtons'
    | 'attackEnemy'
    | 'blockEnemy'
    | 'attackAllEnemies'
    | 'mute'
    | 'unmute'
    | 'empty'
    | 'compound';

export interface ButtonMacroConfig {
    macroType: MacroType | string;  // string allows plugin macros like "plugin:..."
    command?: string;
    direction?: string;
    enemySlot?: number; // For attackEnemy and blockEnemy macros (0-2)
    pluginConfig?: Record<string, any>;
    steps?: ButtonMacroConfig[]; // For compound macro: sequential steps to execute
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

export type ListPosition = 'top' | 'bottom' | 'left' | 'right';
export type ListGrowDirection = 'horizontal' | 'vertical';

export interface DesktopButtonSetting extends BaseButtonSetting {
    id: string;
    command: string;       // required for main action
    fontColor: string;     // required (not optional)
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

export const defaultFontColor = '#f1f5f9';

export const directionOptions = ["nw", "n", "ne", "w", "e", "sw", "s", "se", "u", "d"] as const;

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

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `buttonSettings.ts` (other existing errors may exist).

- [ ] **Step 3: Commit**

```bash
git add src/web/buttonSettings.ts
git commit -m "feat: add shared button settings types and constants"
```

---

### Task 2: Migrate `mobileButtonSettings.ts` to use `macroType`

**Files:**
- Modify: `src/web/mobileButtonSettings.ts`

This task renames every `macro` field to `macroType` in the mobile settings module and re-exports types from `buttonSettings.ts`. The old types (`ButtonSetting`, `ButtonMacroConfig`, `MacroType`) are kept as re-exports so downstream consumers don't all break at once — they'll be updated in Task 6.

- [ ] **Step 1: Update imports and re-exports at the top of `mobileButtonSettings.ts`**

Replace the entire block from line 1 through line 43 (the imports, `MacroType`, `ButtonMacroConfig`, and `ButtonSetting` type definitions):

```ts
import { globalStorage } from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";
import type { MacroType, ButtonMacroConfig, MobileButtonSetting } from "./buttonSettings";
export type { MacroType, ButtonMacroConfig, MobileButtonSetting };

// Backward-compat alias — will be removed once all consumers are updated
export type ButtonSetting = MobileButtonSetting;
```

Remove the old `MacroType`, `ButtonMacroConfig`, and `ButtonSetting` type/interface definitions that were previously in this file. Keep `RadialCommandSetting`, `RadialSettings`, and everything else below.

- [ ] **Step 2: Rename `macro` → `macroType` in `defaultSettings`**

In the `defaultSettings` record (lines 67-171), replace every `macro:` key with `macroType:`. For example:

```ts
// Before:
'z-list-toggle': { macro: 'zList', label: '/z', color: '#6EB4DC', fontColor: defaultFontColor },
// After:
'z-list-toggle': { macroType: 'zList', label: '/z', color: '#6EB4DC', fontColor: defaultFontColor },
```

Apply this to all ~25 entries in `defaultSettings`.

- [ ] **Step 3: Rename `macro` → `macroType` in `emptyButton`**

```ts
// Before:
const emptyButton: MobileButtonSetting = { macro: 'empty', label: '', color: 'transparent', fontColor: defaultFontColor };
// After:
const emptyButton: MobileButtonSetting = { macroType: 'empty', label: '', color: 'transparent', fontColor: defaultFontColor };
```

- [ ] **Step 4: Rename `macro` → `macroType` in `parseSteps`**

In the `parseSteps` function (lines 237-254), rename field access:

```ts
function parseSteps(raw: unknown): ButtonMacroConfig[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const steps: ButtonMacroConfig[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        // Support both old 'macro' and new 'macroType' field names
        const macroType = typeof entry.macroType === 'string' ? entry.macroType
            : typeof entry.macro === 'string' ? entry.macro : '';
        if (!macroType || macroType === 'compound') continue; // prevent nesting
        const step: ButtonMacroConfig = { macroType };
        if (typeof entry.command === 'string') step.command = entry.command;
        if (typeof entry.direction === 'string') step.direction = entry.direction;
        if (typeof entry.enemySlot === 'number') step.enemySlot = entry.enemySlot;
        if (entry.pluginConfig && typeof entry.pluginConfig === 'object') {
            step.pluginConfig = entry.pluginConfig as Record<string, any>;
        }
        steps.push(step);
    }
    return steps.length > 0 ? steps : undefined;
}
```

- [ ] **Step 5: Rename `macro` → `macroType` in `mergeButtonSettings`**

```ts
function mergeButtonSettings(buttons: Record<string, MobileButtonSetting>): Record<string, MobileButtonSetting> {
    const merged: Record<string, MobileButtonSetting> = {};
    const keys = new Set([...Object.keys(defaultSettings), ...Object.keys(buttons || {})]);
    keys.forEach(id => {
        const base = defaultSettings[id] || emptyButton;
        const override = (buttons && buttons[id]) || {};
        const cfg: MobileButtonSetting = { ...base, ...override };
        cfg.fontColor = cfg.fontColor || base.fontColor || defaultFontColor;
        // Support old 'macro' field from stored settings
        if (!cfg.macroType && (cfg as any).macro) {
            cfg.macroType = (cfg as any).macro;
            delete (cfg as any).macro;
        }
        if (cfg.macroType === 'compound') {
            cfg.steps = parseSteps((override as any).steps);
        }
        // Migrate hold config
        if (cfg.hold && (cfg.hold as any).macro && !cfg.hold.macroType) {
            cfg.hold = { ...cfg.hold, macroType: (cfg.hold as any).macro };
            delete (cfg as any).hold.macro;
        }
        merged[id] = cfg;
    });
    return merged;
}
```

- [ ] **Step 6: Rename `macro` → `macroType` in `applySettings`**

In the `applySettings` function, replace all `cfg.macro` references with `cfg.macroType`. There are about 10 occurrences:

- `cfg.macro === 'specialExit'` → `cfg.macroType === 'specialExit'`
- `cfg.macro === 'kierunek'` → `cfg.macroType === 'kierunek'`
- `cfg.macro === 'empty'` → `cfg.macroType === 'empty'`
- `b.macro === 'kierunek'` → `b.macroType === 'kierunek'`

- [ ] **Step 7: Remove old `defaultFontColor` export (use from `buttonSettings.ts`)**

The `defaultFontColor` constant is now defined in `buttonSettings.ts`. Remove the definition from `mobileButtonSettings.ts` and import it:

```ts
import { type MacroType, type ButtonMacroConfig, type MobileButtonSetting, defaultFontColor } from "./buttonSettings";
export { defaultFontColor };
export type { MacroType, ButtonMacroConfig, MobileButtonSetting };
export type ButtonSetting = MobileButtonSetting;
```

- [ ] **Step 8: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Errors only from downstream consumers still using old `.macro` field — those will be fixed in Task 6.

- [ ] **Step 9: Commit**

```bash
git add src/web/mobileButtonSettings.ts
git commit -m "refactor: rename macro to macroType in mobileButtonSettings"
```

---

### Task 3: Migrate `desktopButtonSettings.ts` to use shared types

**Files:**
- Modify: `src/web/desktopButtonSettings.ts`

- [ ] **Step 1: Replace type imports and remove `DesktopButtonMacroConfig`**

Replace the imports and type definitions at the top of the file (lines 1-15):

```ts
import { globalStorage } from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";
import type { MacroType, ButtonMacroConfig, DesktopButtonSetting, ListPosition, ListGrowDirection } from "./buttonSettings";
export type { DesktopButtonSetting, ListPosition, ListGrowDirection };
```

Remove the entire `DesktopButtonMacroConfig` interface definition and the `DesktopButtonSetting` interface definition — they now come from `buttonSettings.ts`.

Keep `DesktopButtonsSettings` interface in this file since it's desktop-specific:

```ts
export interface DesktopButtonsSettings {
    buttons: DesktopButtonSetting[];
    locked: boolean;
}
```

- [ ] **Step 2: Remove `ListPosition` and `ListGrowDirection` type definitions**

These are now in `buttonSettings.ts`. Delete lines 5-6:
```ts
// DELETE these:
export type ListPosition = 'top' | 'bottom' | 'left' | 'right';
export type ListGrowDirection = 'horizontal' | 'vertical';
```

- [ ] **Step 3: Remove `defaultFontColor` (import from `buttonSettings.ts`)**

```ts
import { type MacroType, type ButtonMacroConfig, type DesktopButtonSetting, type ListPosition, type ListGrowDirection, defaultFontColor } from "./buttonSettings";
export { defaultFontColor };
```

Remove the local `export const defaultFontColor = '#f1f5f9';` line.

- [ ] **Step 4: Replace `DesktopButtonMacroConfig` with `ButtonMacroConfig` throughout the file**

In `parseDesktopSteps` (line 79-99): Change return type and step type:

```ts
function parseDesktopSteps(raw: unknown): ButtonMacroConfig[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const steps: ButtonMacroConfig[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const rawType = typeof entry.macroType === 'string' ? entry.macroType : '';
        if (!rawType || rawType === 'compound') continue;
        const macroType = validMacroTypes.includes(rawType as MacroType) || rawType.startsWith('plugin:')
            ? rawType : undefined;
        if (!macroType) continue;
        const step: ButtonMacroConfig = { macroType };
        if (typeof entry.command === 'string') step.command = entry.command;
        if (typeof entry.direction === 'string') step.direction = entry.direction;
        if (typeof entry.enemySlot === 'number') step.enemySlot = entry.enemySlot;
        if (entry.pluginConfig && typeof entry.pluginConfig === 'object') {
            step.pluginConfig = entry.pluginConfig as Record<string, any>;
        }
        steps.push(step);
    }
    return steps.length > 0 ? steps : undefined;
}
```

In `parseHoldConfig` (line 101-135): Change return type:

```ts
function parseHoldConfig(candidate: Record<string, unknown>): ButtonMacroConfig | undefined {
```

Update the internal references from `DesktopButtonMacroConfig` to `ButtonMacroConfig`. The logic stays the same.

In `createDefaultButton` (line 49-64): The return type stays `DesktopButtonSetting` (from `buttonSettings.ts`).

- [ ] **Step 5: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add src/web/desktopButtonSettings.ts
git commit -m "refactor: use shared ButtonMacroConfig in desktopButtonSettings"
```

---

### Task 4: Add migration v6 for mobile `macro` → `macroType`

**Files:**
- Modify: `src/modules/core/settingsMigrations.ts`
- Modify: `src/web/main.ts`

- [ ] **Step 1: Add migration v6 and `migrateMobileButtonMacroField` to `settingsMigrations.ts`**

Add to the `migrations` array after the v5 entry:

```ts
    {
        version: 6,
        description: 'Rename macro to macroType in mobileButtonSettings (handled by migrateMobileButtonMacroField)',
        migrate: settings => settings, // No-op for core Settings, actual migration is in separate function
    },
```

Add the migration function at the bottom of the file:

```ts
/**
 * Rename `macro` to `macroType` in mobileButtonSettings.
 * This is migration version 6 that converts the old field name used in
 * mobile button configs to the unified `macroType` field.
 */
export function migrateMobileButtonMacroField(): void {
    const currentVersion = getMigrationsVersion();

    // This is migration version 6
    if (currentVersion >= 6) {
        return;
    }

    try {
        const raw: any = globalStorage.get('mobileButtonSettings');
        if (!raw || typeof raw !== 'object') {
            return;
        }

        let changed = false;

        function renameMacroInConfig(obj: any): void {
            if (!obj || typeof obj !== 'object') return;
            if ('macro' in obj && !('macroType' in obj)) {
                obj.macroType = obj.macro;
                delete obj.macro;
                changed = true;
            }
            // Recurse into hold config
            if (obj.hold && typeof obj.hold === 'object') {
                renameMacroInConfig(obj.hold);
            }
            // Recurse into steps array
            if (Array.isArray(obj.steps)) {
                for (const step of obj.steps) {
                    renameMacroInConfig(step);
                }
            }
            // Recurse into hold.steps
            if (obj.hold && Array.isArray(obj.hold.steps)) {
                for (const step of obj.hold.steps) {
                    renameMacroInConfig(step);
                }
            }
        }

        // Process each layout (solo, team, leader)
        for (const mode of ['solo', 'team', 'leader']) {
            const layout = raw[mode];
            if (!layout || typeof layout !== 'object') continue;
            const buttons = layout.buttons || layout;
            if (typeof buttons !== 'object') continue;
            for (const key of Object.keys(buttons)) {
                if (['order', 'cols', 'background'].includes(key)) continue;
                const btn = buttons[key];
                if (btn && typeof btn === 'object') {
                    renameMacroInConfig(btn);
                }
            }
        }

        // Also handle legacy flat format (no solo/team/leader wrapper)
        if (!raw.solo && !raw.team && !raw.leader) {
            for (const key of Object.keys(raw)) {
                if (['order', 'cols', 'background', 'locked', 'radial', 'buttonSize', 'buttonGap'].includes(key)) continue;
                const btn = raw[key];
                if (btn && typeof btn === 'object' && ('macro' in btn || 'macroType' in btn)) {
                    renameMacroInConfig(btn);
                }
            }
        }

        if (changed) {
            globalStorage.set('mobileButtonSettings', raw);
            console.log('[SettingsMigrations] Renamed macro to macroType in mobileButtonSettings');
        }
    } catch (e) {
        console.error('[SettingsMigrations] Failed to migrate mobileButtonSettings macro field:', e);
    }
}
```

- [ ] **Step 2: Add migration call in `src/web/main.ts`**

After line 84 (`migrateFooterComponentVisibility();`), add:

```ts
import {
    migrateButtonSizeMultiplier,
    migrateFooterComponentVisibility,
    migrateMobileButtonMacroField,
    runAllSettingsMigrations
} from "@modules/core/settingsMigrations"
```

And in the migration block:

```ts
runAllSettingsMigrations();
migrateButtonSizeMultiplier();
migrateFooterComponentVisibility();
migrateMobileButtonMacroField();
```

- [ ] **Step 3: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/modules/core/settingsMigrations.ts src/web/main.ts
git commit -m "feat: add migration v6 to rename macro to macroType in mobile settings"
```

---

### Task 5: Write e2e test for migration

**Files:**
- Create: `e2e/mobile-button-migration.spec.ts`

- [ ] **Step 1: Create the e2e test file**

```ts
import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    resetCommandLog,
    waitForCommandInput,
} from './support/mocks';
import { Page } from '@playwright/test';

test.describe('Mobile button settings migration (macro → macroType)', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
    });

    test('migrates old macro field to macroType on app load', async ({ page }) => {
        // Seed old-format mobile button settings with 'macro' field
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'command',
                            label: 'Test',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            command: 'zerknij',
                        },
                        'button-2': {
                            macro: 'compound',
                            label: 'Combo',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            steps: [
                                { macro: 'command', command: 'zerknij' },
                                { macro: 'kierunek', direction: 'n' },
                            ],
                        },
                        'button-3': {
                            macro: 'command',
                            label: 'HoldTest',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            command: 'ekwipunek',
                            holdEnabled: true,
                            hold: {
                                macro: 'command',
                                command: 'zerknij',
                            },
                        },
                    },
                    order: ['button-1', 'button-2', 'button-3'],
                    cols: 3,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                team: {
                    buttons: {},
                    order: [],
                    cols: 4,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                leader: {
                    buttons: {},
                    order: [],
                    cols: 4,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                locked: false,
                radial: { enabled: true, commands: [] },
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);

        // Verify migration happened — check stored settings now use macroType
        const migrated = await page.evaluate(() => {
            const raw = localStorage.getItem('mobileButtonSettings');
            if (!raw) return null;
            return JSON.parse(raw);
        });

        // Simple button migrated
        expect(migrated.solo.buttons['button-1'].macroType).toBe('command');
        expect(migrated.solo.buttons['button-1'].macro).toBeUndefined();

        // Compound button migrated
        expect(migrated.solo.buttons['button-2'].macroType).toBe('compound');
        expect(migrated.solo.buttons['button-2'].macro).toBeUndefined();

        // Compound steps migrated
        expect(migrated.solo.buttons['button-2'].steps[0].macroType).toBe('command');
        expect(migrated.solo.buttons['button-2'].steps[0].macro).toBeUndefined();
        expect(migrated.solo.buttons['button-2'].steps[1].macroType).toBe('kierunek');
        expect(migrated.solo.buttons['button-2'].steps[1].macro).toBeUndefined();

        // Hold config migrated
        expect(migrated.solo.buttons['button-3'].hold.macroType).toBe('command');
        expect(migrated.solo.buttons['button-3'].hold.macro).toBeUndefined();
    });

    test('buttons with old macro format still execute correctly after migration', async ({ page }) => {
        // Seed old-format settings
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'command',
                            label: 'Zerknij',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            command: 'zerknij',
                        },
                    },
                    order: ['button-1'],
                    cols: 1,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                team: {
                    buttons: {},
                    order: [],
                    cols: 4,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                leader: {
                    buttons: {},
                    order: [],
                    cols: 4,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                locked: true,
                radial: { enabled: true, commands: [] },
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await resetCommandLog(page);

        // Click the button
        const btn = page.locator('#button-1');
        await expect(btn).toBeVisible({ timeout: 5000 });
        await btn.click();

        // Verify command was sent
        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send command after migration', timeout: 5000 }
        ).toEqual(expect.arrayContaining(['zerknij']));
    });
});
```

- [ ] **Step 2: Run the e2e test**

Run: `timeout 180 yarn test:e2e e2e/mobile-button-migration.spec.ts 2>&1 || true`
Expected: Tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/mobile-button-migration.spec.ts
git commit -m "test(e2e): add migration test for mobile button macro → macroType"
```

---

### Task 6: Update all downstream consumers of `.macro` → `.macroType`

**Files:**
- Modify: `src/web/scripts/mobileDirectionButtons.ts` — rename 20 occurrences of `.macro` to `.macroType`
- Modify: `src/web/options/ButtonGrid.tsx` — rename `.macro` to `.macroType`, update type imports
- Modify: `src/web/options/MobileButtons.tsx` — rename `.macro` to `.macroType` in all inline config
- Modify: `src/web/scripts/mobileCommandRadial.ts` — update `ButtonSetting` import path
- Modify: `src/modules/core/pluginButtonMacroRegistry.ts` — update `ButtonSetting` → `MobileButtonSetting` import
- Modify: `src/client/PluginApi.ts` — update `ButtonSetting` → `MobileButtonSetting` import
- Modify: `src/modules/device/deviceTypes.ts` — update import paths
- Modify: `src/modules/core/storageSchema.ts` — update import paths
- Modify: `src/web/scripts/desktopButtons.ts` — replace `DesktopButtonMacroConfig` with `ButtonMacroConfig`

- [ ] **Step 1: Update `mobileDirectionButtons.ts`**

Replace the import at the top:
```ts
// Before:
import {
    loadSettings as loadMobileButtonSettings,
    ButtonSetting,
    Settings,
    defaultFontColor,
    defaultBackground,
} from "../mobileButtonSettings";
// After:
import {
    loadSettings as loadMobileButtonSettings,
    Settings,
    defaultBackground,
} from "../mobileButtonSettings";
import { type MobileButtonSetting, defaultFontColor } from "../buttonSettings";
```

Then do a global find-and-replace of `.macro` → `.macroType` in this file (20 occurrences). Also replace `ButtonSetting` type references with `MobileButtonSetting`.

Note: Be careful not to replace `.macroType` occurrences that may already exist, and not to rename unrelated variables. The occurrences are all property accesses like `cfg.macro`, `hold.macro`, `step.macro`, `b.macro`.

- [ ] **Step 2: Update `ButtonGrid.tsx`**

Replace imports:
```ts
// Before:
import { ButtonSetting, Settings, defaultSettings, defaultBackground, defaultButtonSize, defaultButtonGap, defaultFontColor, computeBoxShadow } from "../mobileButtonSettings";
// After:
import { Settings, defaultSettings, defaultBackground, defaultButtonSize, defaultButtonGap, computeBoxShadow } from "../mobileButtonSettings";
import { type MobileButtonSetting, defaultFontColor } from "../buttonSettings";
```

Update the `Props` interface:
```ts
    emptySetting: MobileButtonSetting;
```

Replace `.macro` with `.macroType` in the component body (4 occurrences):
- `cfg.macro !== 'kierunek'` → `cfg.macroType !== 'kierunek'`
- `cfg.macro === 'kierunek'` → `cfg.macroType === 'kierunek'`
- `cfg.macro === 'empty'` → `cfg.macroType === 'empty'`

- [ ] **Step 3: Update `MobileButtons.tsx` `.macro` references**

Replace `.macro` with `.macroType` everywhere in MobileButtons.tsx. This includes:
- `activeCfg.macro` → `activeCfg.macroType` (many occurrences in the config panel JSX)
- `update(active!.set, active!.id, 'macro', val)` → `update(active!.set, active!.id, 'macroType', val)`
- `holdCfg.macro` → `holdCfg.macroType`
- `step.macro` → `step.macroType`
- `{ macro: 'command' as MacroType, command: '' }` → `{ macroType: 'command' as MacroType, command: '' }`
- `{ macro: 'empty', ... }` → `{ macroType: 'empty', ... }`

Also update the `ButtonSetting` type references to `MobileButtonSetting` in the imports and type annotations.

- [ ] **Step 4: Update `mobileCommandRadial.ts`**

Update the import:
```ts
// Before:
import { loadSettings, Settings, LayoutSettings, ButtonSetting, RadialCommandSetting } from "../mobileButtonSettings";
// After:
import { loadSettings, Settings, LayoutSettings, RadialCommandSetting } from "../mobileButtonSettings";
import type { MobileButtonSetting } from "../buttonSettings";
```

Replace `ButtonSetting` with `MobileButtonSetting` in type annotations (2 occurrences at lines 452 and 478).

- [ ] **Step 5: Update `pluginButtonMacroRegistry.ts`**

```ts
// Before:
import type { ButtonSetting } from "@web/mobileButtonSettings";
import type { DesktopButtonSetting } from "@web/desktopButtonSettings";
// After:
import type { MobileButtonSetting, DesktopButtonSetting } from "@web/buttonSettings";
```

Update `AnyButtonSetting`:
```ts
export type AnyButtonSetting = MobileButtonSetting | DesktopButtonSetting;
```

Update the `onClick` type signature to use `MobileButtonSetting` instead of `ButtonSetting`.

- [ ] **Step 6: Update `PluginApi.ts`**

```ts
// Before:
import type {ButtonSetting} from "@web/mobileButtonSettings";
// After:
import type {MobileButtonSetting} from "@web/buttonSettings";
```

Replace `ButtonSetting` with `MobileButtonSetting` in all type references in this file.

- [ ] **Step 7: Update `deviceTypes.ts`**

```ts
// Before:
import type { DesktopButtonsSettings } from '@web/desktopButtonSettings';
import type { Settings as MobileButtonsSettings } from '@web/mobileButtonSettings';
// After (no change needed if types are re-exported):
```

These imports use `Settings` and `DesktopButtonsSettings`, which are still exported from their respective modules. No change needed here unless the re-exports are removed.

- [ ] **Step 8: Update `storageSchema.ts`**

Same as deviceTypes.ts — check if imports need updating. They import `Settings` and `DesktopButtonsSettings`, which are still exported from the original modules.

- [ ] **Step 9: Update `desktopButtons.ts` (the runtime script)**

```ts
// Before:
import {
    loadSettings as loadDesktopButtonSettings,
    DesktopButtonSetting,
    DesktopButtonsSettings,
    hexToRgba,
    ListGrowDirection,
    ListPosition,
    saveSettings,
} from "../desktopButtonSettings";
// After:
import {
    loadSettings as loadDesktopButtonSettings,
    DesktopButtonsSettings,
    hexToRgba,
    saveSettings,
} from "../desktopButtonSettings";
import type { DesktopButtonSetting, ListGrowDirection, ListPosition } from "../buttonSettings";
```

- [ ] **Step 10: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 11: Run unit tests**

Run: `yarn test 2>&1 > /dev/null || true` then `yarn test --silent 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: update all consumers to use macroType and shared types"
```

---

### Task 7: Create `MacroSelect` shared component

**Files:**
- Create: `src/web/options/MacroSelect.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Form } from "react-bootstrap";
import { macroOptions } from "../buttonSettings";
import type { MacroType } from "../buttonSettings";
import {
    isButtonMacroAvailable,
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";

interface MacroSelectProps {
    value: string;
    onChange: (value: string) => void;
    pluginMacros: PluginButtonMacro[];
    /** Filter which built-in macro options to show. Default: all. */
    filter?: (opt: { value: MacroType; label: string }) => boolean;
    /** Show border-warning class when the current macro is unavailable. Default: false. */
    showUnavailableWarning?: boolean;
    className?: string;
}

export default function MacroSelect({
    value,
    onChange,
    pluginMacros,
    filter,
    showUnavailableWarning,
    className,
}: MacroSelectProps) {
    const filtered = filter ? macroOptions.filter(filter) : macroOptions;
    const isUnavailable = showUnavailableWarning && !isButtonMacroAvailable(value);

    // Group plugin macros by plugin name
    const byPlugin = new Map<string, PluginButtonMacro[]>();
    for (const pm of pluginMacros) {
        const key = pm.pluginName || pm.pluginId;
        if (!byPlugin.has(key)) byPlugin.set(key, []);
        byPlugin.get(key)!.push(pm);
    }

    return (
        <Form.Select
            size="sm"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`${className || ''} ${isUnavailable ? 'border-warning' : ''}`.trim()}
        >
            {filtered.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
            {Array.from(byPlugin.entries()).map(([pluginName, macros]) => (
                <optgroup key={pluginName} label={pluginName}>
                    {macros.map(pm => (
                        <option key={pm.id} value={pm.id}>{pm.label}</option>
                    ))}
                </optgroup>
            ))}
            {value.startsWith('plugin:') && !isButtonMacroAvailable(value) && (
                <option value={value} disabled>
                    {value} (wtyczka niedostępna)
                </option>
            )}
        </Form.Select>
    );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors from `MacroSelect.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/web/options/MacroSelect.tsx
git commit -m "feat: add MacroSelect shared component"
```

---

### Task 8: Create `MacroConfigEditor` shared component

**Files:**
- Create: `src/web/options/MacroConfigEditor.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Button, Form } from "react-bootstrap";
import { directionOptions } from "../buttonSettings";
import type { MacroType, ButtonMacroConfig } from "../buttonSettings";
import {
    getMacroStates,
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";
import MacroSelect from "./MacroSelect";

interface MacroConfigEditorProps {
    config: ButtonMacroConfig;
    onChange: (updates: Partial<ButtonMacroConfig>) => void;
    pluginMacros: PluginButtonMacro[];
    /** Button color — used for plugin state color defaults. */
    buttonColor?: string;
}

export default function MacroConfigEditor({ config, onChange, pluginMacros, buttonColor }: MacroConfigEditorProps) {
    return (
        <>
            {config.macroType === 'command' && (
                <Form.Control
                    as="textarea"
                    size="sm"
                    placeholder="Komenda"
                    value={config.command || ''}
                    onChange={e => onChange({ command: e.target.value })}
                    autoCorrect="off"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                />
            )}

            {config.macroType === 'kierunek' && (
                <Form.Select
                    size="sm"
                    value={config.direction || 'n'}
                    onChange={e => onChange({ direction: e.target.value })}
                >
                    {directionOptions.map(d => (
                        <option key={d} value={d}>{d}</option>
                    ))}
                </Form.Select>
            )}

            {(config.macroType === 'attackEnemy' || config.macroType === 'blockEnemy') && (
                <Form.Select
                    size="sm"
                    value={config.enemySlot ?? 0}
                    onChange={e => onChange({ enemySlot: parseInt(e.target.value) })}
                >
                    <option value={0}>Slot 1</option>
                    <option value={1}>Slot 2</option>
                    <option value={2}>Slot 3</option>
                </Form.Select>
            )}

            {config.macroType === 'compound' && (
                <CompoundStepsEditor
                    steps={config.steps || []}
                    onChange={steps => onChange({ steps })}
                    pluginMacros={pluginMacros}
                />
            )}

            <PluginConfigFields
                macroType={config.macroType}
                pluginConfig={config.pluginConfig}
                onChange={pluginConfig => onChange({ pluginConfig })}
                pluginMacros={pluginMacros}
            />

            <PluginStateConfig
                macroType={config.macroType}
                pluginConfig={config.pluginConfig}
                onChange={pluginConfig => onChange({ pluginConfig })}
                color={buttonColor}
            />
        </>
    );
}

// --- Compound Steps Editor (internal) ---

interface CompoundStepsEditorProps {
    steps: ButtonMacroConfig[];
    onChange: (steps: ButtonMacroConfig[]) => void;
    pluginMacros: PluginButtonMacro[];
}

function CompoundStepsEditor({ steps, onChange, pluginMacros }: CompoundStepsEditorProps) {
    function updateStep(index: number, updates: Partial<ButtonMacroConfig>) {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], ...updates };
        onChange(newSteps);
    }

    function moveStep(index: number, direction: -1 | 1) {
        const newSteps = [...steps];
        const target = index + direction;
        [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
        onChange(newSteps);
    }

    function removeStep(index: number) {
        onChange(steps.filter((_, i) => i !== index));
    }

    function addStep() {
        onChange([...steps, { macroType: 'command' as MacroType, command: '' }]);
    }

    const stepFilter = (opt: { value: MacroType }) => opt.value !== 'empty' && opt.value !== 'compound';

    return (
        <div>
            {steps.map((step, index) => (
                <div key={index} className="mb-2 p-2 border rounded">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="small fw-bold">Krok {index + 1}</span>
                        <div className="d-flex gap-1">
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                disabled={index === 0}
                                onClick={() => moveStep(index, -1)}
                            >^</Button>
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                disabled={index === steps.length - 1}
                                onClick={() => moveStep(index, 1)}
                            >v</Button>
                            <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => removeStep(index)}
                            >X</Button>
                        </div>
                    </div>
                    <MacroSelect
                        value={step.macroType}
                        onChange={value => updateStep(index, { macroType: value })}
                        pluginMacros={pluginMacros}
                        filter={stepFilter}
                        className="mb-1"
                    />
                    <MacroConfigEditor
                        config={step}
                        onChange={updates => updateStep(index, updates)}
                        pluginMacros={pluginMacros}
                        buttonColor={undefined}
                    />
                </div>
            ))}
            <Button
                size="sm"
                variant="outline-primary"
                className="w-100"
                onClick={addStep}
            >+ Dodaj krok</Button>
        </div>
    );
}

// --- Plugin Config Fields (internal) ---

interface PluginConfigFieldsProps {
    macroType: string;
    pluginConfig: Record<string, any> | undefined;
    onChange: (pluginConfig: Record<string, any>) => void;
    pluginMacros: PluginButtonMacro[];
    idPrefix?: string;
}

function PluginConfigFields({ macroType, pluginConfig, onChange, pluginMacros, idPrefix = '' }: PluginConfigFieldsProps) {
    if (!macroType.startsWith('plugin:')) return null;
    const pluginMacro = pluginMacros.find(pm => pm.id === macroType);
    if (!pluginMacro?.configFields?.length) return null;

    const config = pluginConfig || {};

    return (
        <>
            {pluginMacro.configFields.map(field => (
                <Form.Group key={field.name} className="mb-2">
                    <Form.Label>{field.label}</Form.Label>
                    {field.type === 'text' && (
                        <Form.Control
                            size="sm"
                            type="text"
                            value={config[field.name] ?? field.defaultValue ?? ''}
                            onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                        />
                    )}
                    {field.type === 'textarea' && (
                        <Form.Control
                            as="textarea"
                            size="sm"
                            rows={2}
                            value={config[field.name] ?? field.defaultValue ?? ''}
                            onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                        />
                    )}
                    {field.type === 'number' && (
                        <Form.Control
                            size="sm"
                            type="number"
                            value={config[field.name] ?? field.defaultValue ?? 0}
                            onChange={e => onChange({ ...config, [field.name]: Number(e.target.value) })}
                        />
                    )}
                    {field.type === 'select' && field.options && (
                        <Form.Select
                            size="sm"
                            value={config[field.name] ?? field.defaultValue ?? ''}
                            onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                        >
                            {field.options.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </Form.Select>
                    )}
                    {field.type === 'checkbox' && (
                        <Form.Check
                            id={`${idPrefix}plugin-config-${field.name}`}
                            type="checkbox"
                            checked={config[field.name] ?? field.defaultValue ?? false}
                            onChange={e => onChange({ ...config, [field.name]: e.target.checked })}
                        />
                    )}
                </Form.Group>
            ))}
        </>
    );
}

// --- Plugin State Config (internal) ---

interface PluginStateConfigProps {
    macroType: string;
    pluginConfig: Record<string, any> | undefined;
    onChange: (pluginConfig: Record<string, any>) => void;
    color: string | undefined;
}

function PluginStateConfig({ macroType, pluginConfig, onChange, color }: PluginStateConfigProps) {
    if (!macroType.startsWith('plugin:')) return null;
    const states = getMacroStates(macroType);
    if (!states?.length) return null;

    const config = pluginConfig || {};
    const stateLabels = (config.stateLabels || {}) as Record<string, string>;
    const stateColors = (config.stateColors || {}) as Record<string, string>;

    return (
        <div className="mb-2">
            <Form.Label>Stany przycisku</Form.Label>
            <div className="ps-2 border-start">
                {states.map(state => (
                    <div key={state.id} className="mb-2">
                        <div className="small text-muted mb-1">{state.id}</div>
                        <div className="d-flex gap-1 align-items-center">
                            <Form.Control
                                size="sm"
                                type="text"
                                placeholder={state.label}
                                value={stateLabels[state.id] ?? ''}
                                onChange={e => {
                                    const newStateLabels = { ...stateLabels };
                                    if (e.target.value) {
                                        newStateLabels[state.id] = e.target.value;
                                    } else {
                                        delete newStateLabels[state.id];
                                    }
                                    onChange({ ...config, stateLabels: newStateLabels });
                                }}
                            />
                            <Form.Control
                                size="sm"
                                type="color"
                                style={{ width: '40px', flexShrink: 0 }}
                                value={stateColors[state.id] || state.color || color || '#6EB4DC'}
                                onChange={e => {
                                    const newStateColors = { ...stateColors };
                                    newStateColors[state.id] = e.target.value;
                                    onChange({ ...config, stateColors: newStateColors });
                                }}
                            />
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                onClick={() => {
                                    const newStateColors = { ...stateColors };
                                    delete newStateColors[state.id];
                                    onChange({ ...config, stateColors: newStateColors });
                                }}
                            >
                                ↺
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/web/options/MacroConfigEditor.tsx
git commit -m "feat: add MacroConfigEditor shared component"
```

---

### Task 9: Create `HoldConfig` shared component

**Files:**
- Create: `src/web/options/HoldConfig.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Alert, Button, Form } from "react-bootstrap";
import type { MacroType, ButtonMacroConfig } from "../buttonSettings";
import {
    isButtonMacroAvailable,
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";
import MacroSelect from "./MacroSelect";
import MacroConfigEditor from "./MacroConfigEditor";

interface HoldConfigProps {
    holdEnabled: boolean;
    hold: ButtonMacroConfig | undefined;
    onToggle: (enabled: boolean) => void;
    onChangeHold: (hold: ButtonMacroConfig) => void;
    pluginMacros: PluginButtonMacro[];
    locked: boolean;
    idSuffix: string;
}

export default function HoldConfig({
    holdEnabled,
    hold,
    onToggle,
    onChangeHold,
    pluginMacros,
    locked,
    idSuffix,
}: HoldConfigProps) {
    const holdCfg: ButtonMacroConfig = hold || { macroType: 'command' };

    function updateHold(updates: Partial<ButtonMacroConfig>) {
        onChangeHold({ ...holdCfg, ...updates });
    }

    const holdFilter = (opt: { value: MacroType }) => opt.value !== 'empty';

    return (
        <div className="mb-2 pt-2 border-top">
            <Form.Check
                id={`hold-toggle-${idSuffix}`}
                type="checkbox"
                className="mb-2"
                label="Przytrzymanie (hold)"
                checked={holdEnabled}
                onChange={e => onToggle(e.target.checked)}
            />
            {holdEnabled && !locked && (
                <Alert variant="warning" className="py-1 px-2 mb-2 small">
                    Odblokowane przyciski moga kolidowac z przytrzymaniem (przeciaganie po 1s).
                </Alert>
            )}
            {holdEnabled && (
                <>
                    <Form.Group className="mb-2">
                        <Form.Label className="small mb-1">Makro (hold)</Form.Label>
                        <MacroSelect
                            value={holdCfg.macroType || 'command'}
                            onChange={value => {
                                const updates: Partial<ButtonMacroConfig> = { macroType: value };
                                if (value !== 'compound') {
                                    updates.steps = undefined;
                                }
                                updateHold(updates);
                            }}
                            pluginMacros={pluginMacros}
                            filter={holdFilter}
                            showUnavailableWarning
                        />
                    </Form.Group>
                    <MacroConfigEditor
                        config={holdCfg}
                        onChange={updates => updateHold(updates)}
                        pluginMacros={pluginMacros}
                    />
                </>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/web/options/HoldConfig.tsx
git commit -m "feat: add HoldConfig shared component"
```

---

### Task 10: Refactor `MobileButtons.tsx` to use shared components

**Files:**
- Modify: `src/web/options/MobileButtons.tsx`

- [ ] **Step 1: Update imports**

Remove `MacroType` from the mobileButtonSettings import (it comes from buttonSettings now). Add shared component imports:

```tsx
import {
    applySettings,
    createDefaultLayout,
    defaultBackground,
    defaultButtonGap,
    defaultButtonSize,
    defaultCols,
    defaultOrder,
    defaultSettings,
    loadSettings,
    saveSettings,
    Settings,
} from "../mobileButtonSettings";
import { type MacroType, type MobileButtonSetting, defaultFontColor } from "../buttonSettings";
import MacroSelect from "./MacroSelect";
import MacroConfigEditor from "./MacroConfigEditor";
import HoldConfig from "./HoldConfig";
```

- [ ] **Step 2: Remove local `macroOptions` and `directionOptions` constants**

Delete the `macroOptions` array (lines 30-50) and `directionOptions` constant (line 52) — they now come from the shared components.

- [ ] **Step 3: Replace the macro select dropdown in the config panel**

In the button config panel JSX (around lines 570-610), replace the inline `<Form.Select>` for macro selection with:

```tsx
<MacroSelect
    value={activeCfg.macroType}
    onChange={val => {
        if (val === 'empty') {
            makeBlank(active!.set, active!.id);
        } else {
            update(active!.set, active!.id, 'macroType', val);
            if (val !== 'compound') {
                update(active!.set, active!.id, 'steps', undefined);
            }
        }
    }}
    pluginMacros={pluginMacros}
    showUnavailableWarning
    className="mobile-button-macro"
/>
```

- [ ] **Step 4: Replace compound steps editor**

Replace the entire compound steps section (the `activeCfg.macroType === "compound"` block) with:

```tsx
{activeCfg.macroType === "compound" && (
    <div className="mobile-button-config-section">
        <div className="mobile-button-config-section-title">Kroki</div>
        <MacroConfigEditor
            config={activeCfg}
            onChange={updates => {
                const setName = active!.set;
                const id = active!.id;
                Object.entries(updates).forEach(([key, value]) => {
                    update(setName, id, key as keyof MobileButtonSetting, value);
                });
            }}
            pluginMacros={pluginMacros}
        />
    </div>
)}
```

Actually, since `MacroConfigEditor` renders the compound steps internally when `macroType === 'compound'`, and also handles command/direction/enemySlot/plugin fields, we can replace the entire macro-specific options section (command textarea, direction select, enemy slot select, compound steps, plugin config, plugin states) with a single `MacroConfigEditor`. But the mobile config panel has a specific layout with sections and CSS classes. The cleanest approach is:

Replace the inline command/direction/enemySlot/compound/plugin sections with `MacroConfigEditor`:

```tsx
{/* Macro-specific options */}
{activeCfg.macroType !== 'empty' && (
    <MacroConfigEditor
        config={activeCfg}
        onChange={updates => {
            const setName = active!.set;
            const id = active!.id;
            Object.entries(updates).forEach(([key, value]) => {
                update(setName, id, key as keyof MobileButtonSetting, value);
            });
        }}
        pluginMacros={pluginMacros}
    />
)}
```

This replaces the following blocks:
- The `activeCfg.macroType === "compound"` section
- The `activeCfg.macroType === "kierunek"` direction select
- The `activeCfg.macroType === "command"` textarea
- The `activeCfg.macroType === "attackEnemy"/"blockEnemy"` enemy slot select
- The `activeCfg.macroType.startsWith('plugin:')` config fields
- The `activeCfg.macroType.startsWith('plugin:')` state labels/colors

Keep the `specialExit` sync section since it's mobile-specific (syncWithDirections checkbox + active color picker).

- [ ] **Step 5: Replace hold action section**

Replace the entire hold action block (the `activeCfg.macroType !== 'empty'` IIFE that renders hold config) with:

```tsx
{activeCfg.macroType !== 'empty' && (
    <HoldConfig
        holdEnabled={activeCfg.holdEnabled || false}
        hold={activeCfg.hold}
        onToggle={enabled => update(active!.set, active!.id, 'holdEnabled', enabled)}
        onChangeHold={hold => update(active!.set, active!.id, 'hold', hold)}
        pluginMacros={pluginMacros}
        locked={settings.locked}
        idSuffix={active!.id}
    />
)}
```

- [ ] **Step 6: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 7: Run build**

Run: `yarn build 2>&1 > /dev/null || true` then `npx tsc --noEmit`

- [ ] **Step 8: Commit**

```bash
git add src/web/options/MobileButtons.tsx
git commit -m "refactor: use shared components in MobileButtons"
```

---

### Task 11: Refactor `DesktopButtons.tsx` to use shared components

**Files:**
- Modify: `src/web/options/DesktopButtons.tsx`

- [ ] **Step 1: Update imports**

```tsx
import {
    applySettings,
    createDefaultButton,
    createDefaultSettings,
    defaultBackgroundOpacity,
    defaultButtonColor,
    defaultFontSize,
    defaultHeight,
    defaultWidth,
    DesktopButtonsSettings,
    hexToRgba,
    loadSettings,
    saveSettings,
} from "../desktopButtonSettings";
import { type MacroType, type DesktopButtonSetting, type ListPosition, type ListGrowDirection, defaultFontColor } from "../buttonSettings";
import MacroSelect from "./MacroSelect";
import MacroConfigEditor from "./MacroConfigEditor";
import HoldConfig from "./HoldConfig";
```

Remove the `MacroType` import from `mobileButtonSettings`.

- [ ] **Step 2: Remove local `macroOptions`, `directionOptions`, `listMacros`, `isListMacro`**

Delete the local `macroOptions` array (lines 38-58), `directionOptions` (line 36), and the `listMacros`/`isListMacro` definitions (lines 30-34). Import `isListMacro` logic inline or re-define it locally since it's used for desktop-specific list rendering:

```tsx
const listMacros = ['zList', 'zaList', 'wList', 'przeList', 'idzList'];
function isListMacro(macroType: string): boolean {
    return listMacros.includes(macroType);
}
```

(Keep `listMacros`/`isListMacro` — they're used for the desktop preview rendering which is desktop-specific.)

- [ ] **Step 3: Replace macro select dropdown**

Replace the inline `<Form.Select>` for macro selection (around lines 320-357) with:

```tsx
<Form.Group className="mb-2">
    <Form.Label>Makro</Form.Label>
    <MacroSelect
        value={selectedBtn.macroType}
        onChange={val => {
            const updates: Partial<DesktopButtonSetting> = { macroType: val };
            if (val !== 'compound') {
                updates.steps = undefined;
            }
            updateButton(selectedBtn.id, updates);
        }}
        pluginMacros={pluginMacros}
        showUnavailableWarning
    />
    {!isButtonMacroAvailable(selectedBtn.macroType) && (
        <Form.Text className="text-warning">
            Ta wtyczka nie jest zaladowana. Makro nie bedzie dzialac.
        </Form.Text>
    )}
</Form.Group>
```

- [ ] **Step 4: Replace macro-specific fields with MacroConfigEditor**

Replace the inline command textarea, enemySlot select, compound steps editor, plugin config fields, and plugin state labels/colors with:

```tsx
<MacroConfigEditor
    config={selectedBtn}
    onChange={updates => updateButton(selectedBtn.id, updates)}
    pluginMacros={pluginMacros}
/>
```

Keep the list-macro-specific fields (listPosition, listGrowDirection, listCloseOnlyByButton) since they're desktop-only.

- [ ] **Step 5: Replace hold section**

Replace the hold action block with:

```tsx
{selectedBtn.macroType !== 'empty' && (
    <HoldConfig
        holdEnabled={selectedBtn.holdEnabled || false}
        hold={selectedBtn.hold}
        onToggle={enabled => updateButton(selectedBtn.id, { holdEnabled: enabled })}
        onChangeHold={hold => updateButton(selectedBtn.id, { hold })}
        pluginMacros={pluginMacros}
        locked={settings.locked}
        idSuffix={selectedBtn.id}
    />
)}
```

- [ ] **Step 6: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 7: Commit**

```bash
git add src/web/options/DesktopButtons.tsx
git commit -m "refactor: use shared components in DesktopButtons"
```

---

### Task 12: Remove backward-compat alias and clean up

**Files:**
- Modify: `src/web/mobileButtonSettings.ts`

- [ ] **Step 1: Remove `ButtonSetting` backward-compat alias**

If all consumers have been updated to use `MobileButtonSetting`, remove:

```ts
// DELETE:
export type ButtonSetting = MobileButtonSetting;
```

Run: `npx tsc --noEmit 2>&1 | head -30`

If any files still reference `ButtonSetting`, update them first.

- [ ] **Step 2: Verify build**

Run: `yarn build 2>&1 > /dev/null || true` then `npx tsc --noEmit`

- [ ] **Step 3: Run all unit tests**

Run: `yarn test 2>&1 > /dev/null || true` then `yarn test --silent 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Run all e2e tests**

Run: `timeout 600 yarn test:e2e 2>&1 || true`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove backward-compat ButtonSetting alias, final cleanup"
```

---

### Task 13: Update existing e2e tests if needed

**Files:**
- Possibly modify: `e2e/compound-macro-mobile.spec.ts`

- [ ] **Step 1: Check if `compound-macro-mobile.spec.ts` seeds with `macro` field**

The existing test at `e2e/compound-macro-mobile.spec.ts` seeds localStorage with `macro: 'compound'` and `steps: [{ macro: 'command', ... }]`. Since the migration runs on app load, these tests should still work — the old format gets migrated.

Run: `timeout 180 yarn test:e2e e2e/compound-macro-mobile.spec.ts 2>&1 || true`

If tests pass, no changes needed. If they fail, update the seeded data to use `macroType` instead of `macro`.

- [ ] **Step 2: Run the full e2e suite**

Run: `timeout 600 yarn test:e2e 2>&1 || true`
Expected: All tests pass.

- [ ] **Step 3: Commit if any changes were needed**

```bash
git add -A
git commit -m "test(e2e): update e2e tests for macroType field"
```

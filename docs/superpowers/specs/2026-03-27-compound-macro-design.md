# Compound Macro for Buttons

## Summary

Add a `compound` macro type that allows a single button (mobile or desktop) to execute multiple macro steps sequentially with no delay. This eliminates the need for users to write plugins when they simply want one button to perform several actions.

## Data Model

### MacroType

Add `'compound'` to the `MacroType` union in `mobileButtonSettings.ts`:

```typescript
export type MacroType =
    | 'functional'
    | ... existing types ...
    | 'compound';
```

### ButtonMacroConfig (Mobile)

Add optional `steps` array:

```typescript
export interface ButtonMacroConfig {
    macro: MacroType | string;
    command?: string;
    direction?: string;
    enemySlot?: number;
    pluginConfig?: Record<string, any>;
    steps?: ButtonMacroConfig[];  // Only used when macro === 'compound'
}
```

### DesktopButtonMacroConfig (Desktop)

Same pattern:

```typescript
export interface DesktopButtonMacroConfig {
    macroType: MacroType | string;
    command?: string;
    direction?: string;
    enemySlot?: number;
    pluginConfig?: Record<string, any>;
    steps?: DesktopButtonMacroConfig[];  // Only used when macroType === 'compound'
}
```

### Nesting Prevention

Steps cannot themselves be `compound`. This is enforced:
- **UI**: The step macro selector does not include the `compound` option
- **Parsing**: Any step with `macro === 'compound'` is filtered out during `loadSettings`

### Hold Actions

Both `ButtonSetting.hold` and `DesktopButtonSetting.hold` already reference their respective macro config types, so compound works as a hold action with no extra wiring.

## Execution

### Mobile (`mobileDirectionButtons.ts`)

Add a `'compound'` case to the `executeMacro` switch:

```typescript
case 'compound':
    if (cfg?.steps) {
        for (const step of cfg.steps) {
            this.executeMacro(
                step.macro, step.command, step.direction,
                step.enemySlot, step.pluginConfig, btn, step
            );
        }
    }
    break;
```

### Desktop (`desktopButtons.ts`)

Add a `'compound'` case to the `executeMacro` switch:

```typescript
case 'compound':
    if (settings?.steps) {
        for (const step of settings.steps) {
            this.executeMacro(
                step.macroType, step.command,
                step.enemySlot, step.pluginConfig, settings
            );
        }
    }
    break;
```

### Behavior

- Steps execute synchronously, one after another, no delay
- Each step reuses the existing `executeMacro` method so any macro type works as a step
- Steps that are `compound` themselves are prevented at the UI and parsing layers

## Settings UI

### Macro Options

Add to `macroOptions` in both `MobileButtons.tsx` and `DesktopButtons.tsx`:

```typescript
{ value: "compound", label: "Zlożone (wiele akcji)" }
```

### Step Editor

When `macro === 'compound'`, replace the normal command/direction fields with a step list editor:

- Each step shows:
  - Macro type selector (all types except `compound` and `empty`)
  - Relevant fields for the selected macro type (command, direction, enemySlot, plugin config)
- "Add step" button at the bottom to append a new step
- Remove button (X) per step to delete it
- Up/down arrow buttons per step for reordering
- The hold action section also supports compound (same step editor renders when hold macro is `compound`)

## Persistence & Validation

### Mobile (`mobileButtonSettings.ts`)

In `mergeButtonSettings` / `extractButtons` / `parseLayout`:
- When parsing a button config, if `macro === 'compound'`, validate and parse the `steps` array
- Each step is validated as a `ButtonMacroConfig` (check macro type, command, direction, etc.)
- Filter out any step where `macro === 'compound'` (prevent nesting)
- If `steps` is empty or invalid after filtering, treat as `empty` macro

### Desktop (`desktopButtonSettings.ts`)

In `parseButton` / `parseHoldConfig`:
- Add `'compound'` to `validMacroTypes`
- When `macroType === 'compound'`, parse and validate the `steps` array
- Same nesting prevention: filter out compound steps
- Same fallback: empty steps = treat as no-op

### Save

No changes needed — `saveSettings` serializes the full object as-is.

## Files to Modify

1. `src/web/mobileButtonSettings.ts` — MacroType, ButtonMacroConfig, parsing
2. `src/web/desktopButtonSettings.ts` — DesktopButtonMacroConfig, validMacroTypes, parsing
3. `src/web/scripts/mobileDirectionButtons.ts` — executeMacro compound case
4. `src/web/scripts/desktopButtons.ts` — executeMacro compound case
5. `src/web/options/MobileButtons.tsx` — macroOptions, step editor UI
6. `src/web/options/DesktopButtons.tsx` — macroOptions, step editor UI

## Testing

- **Unit**: compound macro with multiple steps executes all steps in order
- **Unit**: nested compound steps are stripped during parsing
- **E2E**: create a compound button in mobile settings UI, verify it sends multiple commands

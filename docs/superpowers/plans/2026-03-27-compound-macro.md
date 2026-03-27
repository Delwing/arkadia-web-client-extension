# Compound Macro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow buttons (mobile and desktop) to execute multiple macros sequentially via a new `compound` macro type.

**Architecture:** Add `'compound'` to `MacroType`, add `steps?: ButtonMacroConfig[]` to macro config interfaces, handle compound execution in both mobile and desktop `executeMacro` methods, and add a step list editor UI in both settings components.

**Tech Stack:** TypeScript, React, React-Bootstrap

---

### Task 1: Add `compound` to types and interfaces

**Files:**
- Modify: `src/web/mobileButtonSettings.ts:4-30` (MacroType union and ButtonMacroConfig interface)
- Modify: `src/web/desktopButtonSettings.ts:8-14` (DesktopButtonMacroConfig interface)
- Modify: `src/web/desktopButtonSettings.ts:72-76` (validMacroTypes array)

- [ ] **Step 1: Add `'compound'` to `MacroType` union**

In `src/web/mobileButtonSettings.ts`, add `'compound'` as the last member before the semicolon:

```typescript
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
```

- [ ] **Step 2: Add `steps` to `ButtonMacroConfig`**

In `src/web/mobileButtonSettings.ts`, add `steps` field to `ButtonMacroConfig`:

```typescript
export interface ButtonMacroConfig {
    macro: MacroType | string;  // string allows plugin macros like "plugin:..."
    command?: string;
    direction?: string;
    enemySlot?: number; // For attackEnemy and blockEnemy macros (0-2)
    pluginConfig?: Record<string, any>;
    steps?: ButtonMacroConfig[];  // For compound macro: sequential steps to execute
}
```

- [ ] **Step 3: Add `steps` to `DesktopButtonMacroConfig`**

In `src/web/desktopButtonSettings.ts`, add `steps` field:

```typescript
export interface DesktopButtonMacroConfig {
    macroType: MacroType | string;  // string allows plugin macros like "plugin:..."
    command?: string;
    direction?: string;
    enemySlot?: number;
    pluginConfig?: Record<string, any>;
    steps?: DesktopButtonMacroConfig[];  // For compound macro: sequential steps to execute
}
```

- [ ] **Step 4: Add `'compound'` to `validMacroTypes` in desktop settings**

In `src/web/desktopButtonSettings.ts`, update the `validMacroTypes` array:

```typescript
const validMacroTypes: MacroType[] = [
    'functional', 'zList', 'zaList', 'wList', 'przeList', 'idzList',
    'command', 'specialExit', 'kierunek', 'wesprzyj', 'moveMode',
    'toggleButtons', 'attackEnemy', 'blockEnemy', 'attackAllEnemies', 'mute', 'unmute', 'empty',
    'compound'
];
```

- [ ] **Step 5: Run type check**

```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit
```

Expected: no errors (no code uses compound yet, we only added types)

- [ ] **Step 6: Commit**

```bash
git add src/web/mobileButtonSettings.ts src/web/desktopButtonSettings.ts
git commit -m "feat: add compound macro type and steps field to button config interfaces"
```

---

### Task 2: Add compound parsing/validation for mobile settings

**Files:**
- Modify: `src/web/mobileButtonSettings.ts:235-264` (mergeButtonSettings / extractButtons area)

- [ ] **Step 1: Add `parseSteps` helper function**

Add this function before `extractButtons` in `src/web/mobileButtonSettings.ts` (around line 235):

```typescript
function parseSteps(raw: unknown): ButtonMacroConfig[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const steps: ButtonMacroConfig[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const macro = typeof entry.macro === 'string' ? entry.macro : '';
        if (!macro || macro === 'compound') continue; // prevent nesting
        const step: ButtonMacroConfig = { macro };
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

- [ ] **Step 2: Wire `parseSteps` into `mergeButtonSettings`**

In the `mergeButtonSettings` function, after the line `cfg.fontColor = cfg.fontColor || base.fontColor || defaultFontColor;`, add steps parsing:

```typescript
function mergeButtonSettings(buttons: Record<string, ButtonSetting>): Record<string, ButtonSetting> {
    const merged: Record<string, ButtonSetting> = {};
    const keys = new Set([...Object.keys(defaultSettings), ...Object.keys(buttons || {})]);
    keys.forEach(id => {
        const base = defaultSettings[id] || emptyButton;
        const override = (buttons && buttons[id]) || {};
        const cfg: ButtonSetting = { ...base, ...override };
        cfg.fontColor = cfg.fontColor || base.fontColor || defaultFontColor;
        if (cfg.macro === 'compound') {
            cfg.steps = parseSteps((override as any).steps);
        }
        merged[id] = cfg;
    });
    return merged;
}
```

- [ ] **Step 3: Run type check**

```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/web/mobileButtonSettings.ts
git commit -m "feat: add compound macro step parsing for mobile button settings"
```

---

### Task 3: Add compound parsing/validation for desktop settings

**Files:**
- Modify: `src/web/desktopButtonSettings.ts:78-149` (parseHoldConfig and parseButton)

- [ ] **Step 1: Add `parseDesktopSteps` helper function**

Add this function before `parseHoldConfig` in `src/web/desktopButtonSettings.ts` (around line 78):

```typescript
function parseDesktopSteps(raw: unknown): DesktopButtonMacroConfig[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const steps: DesktopButtonMacroConfig[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const rawType = typeof entry.macroType === 'string' ? entry.macroType : '';
        if (!rawType || rawType === 'compound') continue; // prevent nesting
        const macroType = validMacroTypes.includes(rawType as MacroType) || rawType.startsWith('plugin:')
            ? rawType : undefined;
        if (!macroType) continue;
        const step: DesktopButtonMacroConfig = { macroType };
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

- [ ] **Step 2: Wire `parseDesktopSteps` into `parseButton`**

In the `parseButton` function, just before the `return` statement (line 149), parse steps for compound macros and include `steps` in the return object:

```typescript
    const hold = parseHoldConfig(candidate);
    const steps = macroType === 'compound' ? parseDesktopSteps(candidate.steps as unknown) : undefined;
    return { id, label, macroType, command, color, fontColor, fontSize, width, height, x, y, backgroundOpacity, enemySlot, direction, listPosition, listGrowDirection, listCloseOnlyByButton, pluginConfig, holdEnabled, hold, steps };
```

- [ ] **Step 3: Wire `parseDesktopSteps` into `parseHoldConfig`**

In the `parseHoldConfig` function, in the "new format" branch (around line 88), add steps parsing. The returned object becomes:

```typescript
    // Try new format first
    if (holdObj && typeof holdObj === 'object') {
        const rawMacroType = typeof holdObj.macroType === 'string' ? holdObj.macroType : undefined;
        if (!rawMacroType) return undefined;
        const macroType = validMacroTypes.includes(rawMacroType as MacroType) || rawMacroType.startsWith('plugin:')
            ? rawMacroType : 'command';
        const steps = macroType === 'compound' ? parseDesktopSteps(holdObj.steps as unknown) : undefined;
        return {
            macroType,
            command: typeof holdObj.command === 'string' ? holdObj.command : undefined,
            direction: typeof holdObj.direction === 'string' ? holdObj.direction : undefined,
            enemySlot: typeof holdObj.enemySlot === 'number' ? holdObj.enemySlot : undefined,
            pluginConfig: holdObj.pluginConfig && typeof holdObj.pluginConfig === 'object' ? holdObj.pluginConfig as Record<string, any> : undefined,
            steps,
        };
    }
```

- [ ] **Step 4: Run type check**

```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/web/desktopButtonSettings.ts
git commit -m "feat: add compound macro step parsing for desktop button settings"
```

---

### Task 4: Add compound execution to mobile buttons

**Files:**
- Modify: `src/web/scripts/mobileDirectionButtons.ts:1280-1293` (executeMacro switch, before default case)

- [ ] **Step 1: Add `compound` case to mobile `executeMacro`**

In `src/web/scripts/mobileDirectionButtons.ts`, in the `executeMacro` method, add a `compound` case before the `default:` case (line 1286):

```typescript
            case 'unmute':
                this.client.SoundManager.unmute();
                break;
            case 'compound':
                if (cfg?.steps) {
                    for (const step of cfg.steps) {
                        this.executeMacro(step.macro, step.command, step.direction, step.enemySlot, step.pluginConfig, btn, step as any);
                    }
                }
                break;
            default:
```

Note: `step as any` is needed because `ButtonMacroConfig` doesn't extend `ButtonSetting` (it lacks `label`, `color`), but `executeMacro` accepts `ButtonSetting` for the `cfg` parameter. The `cfg` is only used to pass to plugin macro execution and for the `steps` field, both of which work fine with `ButtonMacroConfig`.

- [ ] **Step 2: Run type check**

```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/web/scripts/mobileDirectionButtons.ts
git commit -m "feat: add compound macro execution to mobile buttons"
```

---

### Task 5: Add compound execution to desktop buttons

**Files:**
- Modify: `src/web/scripts/desktopButtons.ts:410-417` (executeMacro switch, after unmute case)

- [ ] **Step 1: Add `compound` case to desktop `executeMacro`**

In `src/web/scripts/desktopButtons.ts`, in the `executeMacro` method, add a `compound` case after `unmute` (line 415) and before the closing `}` of the switch:

```typescript
            case 'unmute':
                this.client.SoundManager.unmute();
                break;
            case 'compound':
                if (settings?.steps) {
                    for (const step of settings.steps) {
                        this.executeMacro(step.macroType, step.command, step.enemySlot, step.pluginConfig, settings);
                    }
                }
                break;
        }
```

Note: We pass the parent `settings` (DesktopButtonSetting) through so that plugin macros in steps can access the button context. The step's own `macroType`, `command`, `enemySlot`, and `pluginConfig` override the per-step behavior.

- [ ] **Step 2: Run type check**

```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/web/scripts/desktopButtons.ts
git commit -m "feat: add compound macro execution to desktop buttons"
```

---

### Task 6: Add compound option to MobileButtons.tsx settings UI

**Files:**
- Modify: `src/web/options/MobileButtons.tsx:30-49` (macroOptions array)
- Modify: `src/web/options/MobileButtons.tsx:695-762` (macro-specific options area, after the specialExit section and before attackEnemy/blockEnemy)

- [ ] **Step 1: Add compound to mobile macroOptions**

In `src/web/options/MobileButtons.tsx`, add the compound option to `macroOptions` array, before `empty`:

```typescript
const macroOptions: { value: MacroType; label: string }[] = [
    { value: "functional", label: "Bind funkcyjny" },
    { value: "zList", label: "Lista /z" },
    { value: "zaList", label: "Lista /za" },
    { value: "wList", label: "Lista /w" },
    { value: "przeList", label: "Lista /prze" },
    { value: "idzList", label: "Lista idz" },
    { value: "command", label: "Wyslij komende" },
    { value: "kierunek", label: "Kierunek" },
    { value: "specialExit", label: "Wyjscie specjalne" },
    { value: "wesprzyj", label: "Wesprzyj prowadzacego" },
    { value: "moveMode", label: "Tryb ruchu" },
    { value: "toggleButtons", label: "Przelacz przyciski" },
    { value: "attackEnemy", label: "Atakuj wroga" },
    { value: "blockEnemy", label: "Zablokuj wroga" },
    { value: "attackAllEnemies", label: "Atakuj wszystkich wrogow" },
    { value: "mute", label: "Wycisz dzwieki" },
    { value: "unmute", label: "Wlacz dzwieki" },
    { value: "compound", label: "Zlozoне (wiele akcji)" },
    { value: "empty", label: "Puste" },
];
```

**Important:** The label uses Polish: `"Zlożone (wiele akcji)"` — verify the exact spelling matches what the user expects. Use ASCII-compatible characters per AGENTS.md (no Polish letters in regex, but labels are fine).

- [ ] **Step 2: Add compound steps editor UI**

In `src/web/options/MobileButtons.tsx`, after the `attackEnemy`/`blockEnemy` enemy slot selector section (around line 762, after the closing `)}` of that block), and before the plugin macro config fields section, add the compound step editor:

```tsx
                        {activeCfg.macro === "compound" && (
                            <div className="mobile-button-config-section">
                                <div className="mobile-button-config-section-title">Kroki</div>
                                {(activeCfg.steps || []).map((step, index) => (
                                    <div key={index} className="mb-2 p-2 border rounded">
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                            <span className="small fw-bold">Krok {index + 1}</span>
                                            <div className="d-flex gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="outline-secondary"
                                                    disabled={index === 0}
                                                    onClick={() => {
                                                        const steps = [...(activeCfg.steps || [])];
                                                        [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
                                                        update(active!.set, active!.id, 'steps', steps);
                                                    }}
                                                >^</Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline-secondary"
                                                    disabled={index === (activeCfg.steps || []).length - 1}
                                                    onClick={() => {
                                                        const steps = [...(activeCfg.steps || [])];
                                                        [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
                                                        update(active!.set, active!.id, 'steps', steps);
                                                    }}
                                                >v</Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline-danger"
                                                    onClick={() => {
                                                        const steps = (activeCfg.steps || []).filter((_, i) => i !== index);
                                                        update(active!.set, active!.id, 'steps', steps);
                                                    }}
                                                >X</Button>
                                            </div>
                                        </div>
                                        <Form.Select
                                            size="sm"
                                            className="mb-1"
                                            value={step.macro}
                                            onChange={e => {
                                                const steps = [...(activeCfg.steps || [])];
                                                steps[index] = { ...steps[index], macro: e.target.value };
                                                update(active!.set, active!.id, 'steps', steps);
                                            }}
                                        >
                                            {macroOptions.filter(o => o.value !== 'empty' && o.value !== 'compound').map(o => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                            {(() => {
                                                const byPlugin = new Map<string, typeof pluginMacros>();
                                                for (const pm of pluginMacros) {
                                                    const key = pm.pluginName || pm.pluginId;
                                                    if (!byPlugin.has(key)) byPlugin.set(key, []);
                                                    byPlugin.get(key)!.push(pm);
                                                }
                                                return Array.from(byPlugin.entries()).map(([pluginName, macros]) => (
                                                    <optgroup key={pluginName} label={pluginName}>
                                                        {macros.map(pm => (
                                                            <option key={pm.id} value={pm.id}>{pm.label}</option>
                                                        ))}
                                                    </optgroup>
                                                ));
                                            })()}
                                        </Form.Select>
                                        {step.macro === 'command' && (
                                            <Form.Control
                                                as="textarea"
                                                size="sm"
                                                placeholder="Komenda"
                                                value={step.command || ''}
                                                onChange={e => {
                                                    const steps = [...(activeCfg.steps || [])];
                                                    steps[index] = { ...steps[index], command: e.target.value };
                                                    update(active!.set, active!.id, 'steps', steps);
                                                }}
                                                autoCorrect="off"
                                                autoComplete="off"
                                                autoCapitalize="off"
                                                spellCheck={false}
                                            />
                                        )}
                                        {step.macro === 'kierunek' && (
                                            <Form.Select
                                                size="sm"
                                                value={step.direction || 'n'}
                                                onChange={e => {
                                                    const steps = [...(activeCfg.steps || [])];
                                                    steps[index] = { ...steps[index], direction: e.target.value };
                                                    update(active!.set, active!.id, 'steps', steps);
                                                }}
                                            >
                                                {directionOptions.map(d => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </Form.Select>
                                        )}
                                        {(step.macro === 'attackEnemy' || step.macro === 'blockEnemy') && (
                                            <Form.Select
                                                size="sm"
                                                value={step.enemySlot ?? 0}
                                                onChange={e => {
                                                    const steps = [...(activeCfg.steps || [])];
                                                    steps[index] = { ...steps[index], enemySlot: parseInt(e.target.value) };
                                                    update(active!.set, active!.id, 'steps', steps);
                                                }}
                                            >
                                                <option value={0}>Slot 1</option>
                                                <option value={1}>Slot 2</option>
                                                <option value={2}>Slot 3</option>
                                            </Form.Select>
                                        )}
                                    </div>
                                ))}
                                <Button
                                    size="sm"
                                    variant="outline-primary"
                                    className="w-100"
                                    onClick={() => {
                                        const steps = [...(activeCfg.steps || []), { macro: 'command' as MacroType, command: '' }];
                                        update(active!.set, active!.id, 'steps', steps);
                                    }}
                                >+ Dodaj krok</Button>
                            </div>
                        )}
```

- [ ] **Step 3: Also import `ButtonMacroConfig` if not already imported**

Check that `ButtonMacroConfig` is available — it's defined in the same file as `ButtonSetting` which is already imported. No additional import needed since `steps` is part of `ButtonSetting`.

- [ ] **Step 4: Run type check**

```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/web/options/MobileButtons.tsx
git commit -m "feat: add compound macro step editor to mobile button settings UI"
```

---

### Task 7: Add compound option to DesktopButtons.tsx settings UI

**Files:**
- Modify: `src/web/options/DesktopButtons.tsx:38-57` (macroOptions array)
- Modify: `src/web/options/DesktopButtons.tsx` (macro-specific options area, after the enemy slot fields)

- [ ] **Step 1: Add compound to desktop macroOptions**

In `src/web/options/DesktopButtons.tsx`, add the compound option before `empty`:

```typescript
const macroOptions: { value: MacroType; label: string }[] = [
    { value: "command", label: "Wyslij komende" },
    { value: "zList", label: "Lista /z" },
    { value: "zaList", label: "Lista /za" },
    { value: "wList", label: "Lista /w" },
    { value: "przeList", label: "Lista /prze" },
    { value: "idzList", label: "Lista idz" },
    { value: "wesprzyj", label: "Wesprzyj prowadzacego" },
    { value: "moveMode", label: "Tryb ruchu" },
    { value: "attackEnemy", label: "Atakuj wroga" },
    { value: "blockEnemy", label: "Zablokuj wroga" },
    { value: "attackAllEnemies", label: "Atakuj wszystkich wrogow" },
    { value: "functional", label: "Bind funkcyjny" },
    { value: "kierunek", label: "Kierunek" },
    { value: "specialExit", label: "Wyjscie specjalne" },
    { value: "toggleButtons", label: "Pokaz/ukryj przyciski" },
    { value: "mute", label: "Wycisz dzwieki" },
    { value: "unmute", label: "Wlacz dzwieki" },
    { value: "compound", label: "Zlożone (wiele akcji)" },
    { value: "empty", label: "Pusty" },
];
```

- [ ] **Step 2: Find the macro-specific options section and add compound step editor**

Look for the section where `command`, `kierunek`, `attackEnemy`/`blockEnemy` macro-specific fields are rendered. Add the compound step editor after those, following the same pattern as mobile but using `macroType` instead of `macro` and `DesktopButtonMacroConfig` step shape:

```tsx
                        {selectedBtn.macroType === "compound" && (
                            <div className="mt-2">
                                <Form.Label className="small fw-bold">Kroki</Form.Label>
                                {(selectedBtn.steps || []).map((step, index) => (
                                    <div key={index} className="mb-2 p-2 border rounded">
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                            <span className="small fw-bold">Krok {index + 1}</span>
                                            <div className="d-flex gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="outline-secondary"
                                                    disabled={index === 0}
                                                    onClick={() => {
                                                        const steps = [...(selectedBtn.steps || [])];
                                                        [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
                                                        updateButton(selectedBtn.id, { steps });
                                                    }}
                                                >^</Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline-secondary"
                                                    disabled={index === (selectedBtn.steps || []).length - 1}
                                                    onClick={() => {
                                                        const steps = [...(selectedBtn.steps || [])];
                                                        [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
                                                        updateButton(selectedBtn.id, { steps });
                                                    }}
                                                >v</Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline-danger"
                                                    onClick={() => {
                                                        const steps = (selectedBtn.steps || []).filter((_, i) => i !== index);
                                                        updateButton(selectedBtn.id, { steps });
                                                    }}
                                                >X</Button>
                                            </div>
                                        </div>
                                        <Form.Select
                                            size="sm"
                                            className="mb-1"
                                            value={step.macroType}
                                            onChange={e => {
                                                const steps = [...(selectedBtn.steps || [])];
                                                steps[index] = { ...steps[index], macroType: e.target.value };
                                                updateButton(selectedBtn.id, { steps });
                                            }}
                                        >
                                            {macroOptions.filter(o => o.value !== 'empty' && o.value !== 'compound').map(o => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                            {(() => {
                                                const byPlugin = new Map<string, typeof pluginMacros>();
                                                for (const pm of pluginMacros) {
                                                    const key = pm.pluginName || pm.pluginId;
                                                    if (!byPlugin.has(key)) byPlugin.set(key, []);
                                                    byPlugin.get(key)!.push(pm);
                                                }
                                                return Array.from(byPlugin.entries()).map(([pluginName, macros]) => (
                                                    <optgroup key={pluginName} label={pluginName}>
                                                        {macros.map(pm => (
                                                            <option key={pm.id} value={pm.id}>{pm.label}</option>
                                                        ))}
                                                    </optgroup>
                                                ));
                                            })()}
                                        </Form.Select>
                                        {step.macroType === 'command' && (
                                            <Form.Control
                                                as="textarea"
                                                size="sm"
                                                placeholder="Komenda"
                                                value={step.command || ''}
                                                onChange={e => {
                                                    const steps = [...(selectedBtn.steps || [])];
                                                    steps[index] = { ...steps[index], command: e.target.value };
                                                    updateButton(selectedBtn.id, { steps });
                                                }}
                                                autoCorrect="off"
                                                autoComplete="off"
                                                autoCapitalize="off"
                                                spellCheck={false}
                                            />
                                        )}
                                        {step.macroType === 'kierunek' && (
                                            <Form.Select
                                                size="sm"
                                                value={step.direction || 'n'}
                                                onChange={e => {
                                                    const steps = [...(selectedBtn.steps || [])];
                                                    steps[index] = { ...steps[index], direction: e.target.value };
                                                    updateButton(selectedBtn.id, { steps });
                                                }}
                                            >
                                                {directionOptions.map(d => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </Form.Select>
                                        )}
                                        {(step.macroType === 'attackEnemy' || step.macroType === 'blockEnemy') && (
                                            <Form.Select
                                                size="sm"
                                                value={step.enemySlot ?? 0}
                                                onChange={e => {
                                                    const steps = [...(selectedBtn.steps || [])];
                                                    steps[index] = { ...steps[index], enemySlot: parseInt(e.target.value) };
                                                    updateButton(selectedBtn.id, { steps });
                                                }}
                                            >
                                                <option value={0}>Slot 1</option>
                                                <option value={1}>Slot 2</option>
                                                <option value={2}>Slot 3</option>
                                            </Form.Select>
                                        )}
                                    </div>
                                ))}
                                <Button
                                    size="sm"
                                    variant="outline-primary"
                                    className="w-100"
                                    onClick={() => {
                                        const steps = [...(selectedBtn.steps || []), { macroType: 'command' as MacroType, command: '' }];
                                        updateButton(selectedBtn.id, { steps });
                                    }}
                                >+ Dodaj krok</Button>
                            </div>
                        )}
```

- [ ] **Step 3: Import `DesktopButtonMacroConfig` if not already imported**

Check if `DesktopButtonMacroConfig` is imported from `desktopButtonSettings`. If `steps` is on `DesktopButtonSetting` (which extends `DesktopButtonMacroConfig`), no additional import is needed since `selectedBtn` is already typed as `DesktopButtonSetting`.

- [ ] **Step 4: Run type check**

```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/web/options/DesktopButtons.tsx
git commit -m "feat: add compound macro step editor to desktop button settings UI"
```

---

### Task 8: Build and verify

**Files:** None (verification only)

- [ ] **Step 1: Full build**

```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit
```

Expected: no type errors, clean build

- [ ] **Step 2: Run unit tests**

```bash
yarn test 2>&1 > /dev/null || true
yarn test --silent 2>&1 | tail -20
```

Expected: all existing tests pass

- [ ] **Step 3: Run e2e tests**

```bash
timeout 600 yarn test:e2e 2>&1 || true
```

Expected: all existing e2e tests pass

- [ ] **Step 4: Commit (if any fixes were needed)**

Only if previous steps required fixes:

```bash
git add -A
git commit -m "fix: address issues found during compound macro verification"
```

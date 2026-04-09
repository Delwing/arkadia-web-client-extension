# Sound Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to assign a custom sound (or silence) per trigger category, instead of all triggers sharing one global beep.

**Architecture:** A new `sound:category` event carries a category name string. `SoundManager` listens for it and resolves the actual sound to play by looking up `uiSettings.soundCategories`. Lua scripts raise `raiseEvent("playSound", "<category>")`, forwarded to `sound:category` in `luaGags.ts`. All existing TS trigger scripts switch from `sound:play`/`"beep"` to `sound:category`/`"<category>"`. Settings UI grows a section with one dropdown per category.

**Tech Stack:** TypeScript, Howler.js (sound playback), jsdom/Jest (unit tests), existing `globalStorage` / `UiSettings` patterns.

---

## Files

| Action | Path |
|---|---|
| Modify | `src/shared/events/clientEvents.ts` |
| Modify | `src/web/defaultUiSettings.ts` |
| Modify | `plugin-types/index.d.ts` |
| Modify | `src/client/SoundManager.ts` |
| Modify | `src/client/scripts/luaGags.ts` |
| Modify | `src/client/lua/color_bloki.lua` |
| Modify | `src/client/lua/color_other.lua` |
| Modify | `src/client/lua/color_ogluchy.lua` |
| Modify | `src/client/scripts/attackBeep.ts` |
| Modify | `src/client/scripts/fishing.ts` |
| Modify | `src/client/scripts/hpAlert.ts` |
| Modify | `src/client/scripts/lamp.ts` |
| Modify | `src/client/scripts/breakItem.ts` |
| Modify | `src/client/scripts/warningTriggers.ts` |
| Modify | `src/client/scripts/buses.ts` |
| Modify | `src/client/scripts/ships.ts` |
| Modify | `src/client/scripts/spells.ts` |
| Modify | `index.html` |
| Modify | `src/web/uiSettings.ts` |
| Modify | `test/client/Client.test.ts` |
| Modify | `test/client/scripts/attackBeep.test.ts` |
| Modify | `test/client/scripts/hpAlert.test.ts` |
| Modify | `test/client/scripts/breakItem.test.ts` |
| Modify | `test/client/scripts/buses.test.ts` |
| Modify | `test/client/scripts/ships.test.ts` |

---

## Task 1: Define types and event

**Files:**
- Modify: `src/shared/events/clientEvents.ts`
- Modify: `src/web/defaultUiSettings.ts`
- Modify: `plugin-types/index.d.ts`

- [ ] **Step 1: Export `SoundCategory` from `clientEvents.ts`**

Add this export before the first `import` in `src/shared/events/clientEvents.ts`:

```typescript
export type SoundCategory =
    | 'attack'
    | 'hp'
    | 'fishing'
    | 'lamp'
    | 'gear'
    | 'transport'
    | 'spell'
    | 'block'
    | 'weapon'
    | 'stun';
```

- [ ] **Step 2: Add `sound:category` to the events interface in `clientEvents.ts`**

In the events interface (near the existing `"sound:play"` and `"playBeep"` lines), add:

```typescript
"sound:category": SoundCategory;
```

The block should look like:

```typescript
"sound:play": { key: string };
"sound:muted": boolean;
"sound:category": SoundCategory;
"playBeep": void;
```

- [ ] **Step 3: Add `SoundCategories` type and field to `defaultUiSettings.ts`**

Add these two exports after the existing type aliases at the top of `src/web/defaultUiSettings.ts`:

```typescript
import type { SoundCategory } from '@shared/events/clientEvents.ts';

// string = custom sound key, null = disabled, missing key = default beep
export type SoundCategories = Partial<Record<SoundCategory, string | null>>;
```

Add `soundCategories` to the `UiSettings` interface:

```typescript
soundCategories?: SoundCategories;
```

Add the default in `defaultUiSettings`:

```typescript
soundCategories: {},
```

- [ ] **Step 4: Add `sound:category` to `plugin-types/index.d.ts`**

In `plugin-types/index.d.ts`, find the block containing `"sound:play"` and `"playBeep"` and add between them:

```typescript
/** Play sound for a named category */
"sound:category": 'attack' | 'hp' | 'fishing' | 'lamp' | 'gear' | 'transport' | 'spell' | 'block' | 'weapon' | 'stun';
```

Result:

```typescript
/** Play sound effect */
"sound:play": { key: string };
/** Play sound for a named category */
"sound:category": 'attack' | 'hp' | 'fishing' | 'lamp' | 'gear' | 'transport' | 'spell' | 'block' | 'weapon' | 'stun';
/** Play beep sound */
"playBeep": void;
```

- [ ] **Step 5: Verify build is clean**

Run:
```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit
```

Expected: no output from `tsc` (= no errors).

- [ ] **Step 6: Commit**

```bash
git add src/shared/events/clientEvents.ts src/web/defaultUiSettings.ts plugin-types/index.d.ts
git commit -m "feat(soundCategories): define SoundCategory type and sound:category event"
```

---

## Task 2: SoundManager — category resolution (TDD)

**Files:**
- Test: `test/client/Client.test.ts`
- Modify: `src/client/SoundManager.ts`

- [ ] **Step 1: Write failing tests for `sound:category` in `test/client/Client.test.ts`**

Add three tests after the existing `'sound playback restarts when triggered twice'` test:

```typescript
test('sound:category with no config plays default beep', async () => {
  const client = new Client((global as any).clientAdapterMock as any);
  await client.prepareSounds();
  const sound = (Howl as jest.Mock).mock.results[0].value;

  client.sendEvent('sound:category', 'attack');

  expect(sound.stop).toHaveBeenCalledTimes(1);
  expect(sound.play).toHaveBeenCalledTimes(1);
});

test('sound:category with null config is silenced', async () => {
  globalStorage.set('uiSettings', {
    ...globalStorage.get('uiSettings'),
    soundCategories: { attack: null },
  } as any);
  const client = new Client((global as any).clientAdapterMock as any);
  await client.prepareSounds();
  const sound = (Howl as jest.Mock).mock.results[0].value;

  client.sendEvent('sound:category', 'attack');

  expect(sound.play).not.toHaveBeenCalled();
});

test('sound:category with custom key plays that sound', async () => {
  globalStorage.set('uiSettings', {
    ...globalStorage.get('uiSettings'),
    soundCategories: { attack: 'my-sound' },
  } as any);
  // mock getCustomSound to return data for 'my-sound'
  const { getCustomSound } = await import('@modules/core/customSounds');
  (getCustomSound as jest.Mock).mockResolvedValueOnce({ data: 'data:audio/mp3;base64,abc', key: 'my-sound', name: 'My Sound' });

  const client = new Client((global as any).clientAdapterMock as any);
  await client.prepareSounds();

  // Trigger category play
  client.sendEvent('sound:category', 'attack');
  // Wait for async sound creation
  await new Promise(resolve => setTimeout(resolve, 0));

  const calls = (Howl as jest.Mock).mock.calls;
  const customSoundCall = calls.find(c => c[0]?.src === 'data:audio/mp3;base64,abc');
  expect(customSoundCall).toBeDefined();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
yarn test --silent 2>&1 | tail -20
```

Expected: 3 new tests failing with something like "not a function" or assertion errors.

- [ ] **Step 3: Add `sound:category` handler and `playCategory` method to `SoundManager.ts`**

Add import at the top of `src/client/SoundManager.ts`:

```typescript
import type { SoundCategory } from '@shared/events/clientEvents.ts';
import type { SoundCategories } from '@web/defaultUiSettings.ts';
```

In the constructor, after the existing `sound:play` handler, add:

```typescript
this.client.on("sound:category", (category) => {
    void this.playCategory(category);
});
```

Add a new private method after the `play` method:

```typescript
private async playCategory(category: SoundCategory): Promise<void> {
    if (this.muted) return;

    resumeAudioContext();

    const uiSettings = globalStorage.get("uiSettings");
    const soundCategories: SoundCategories = uiSettings?.soundCategories ?? {};

    if (category in soundCategories) {
        const key = soundCategories[category];
        if (key === null) return; // disabled — silence
        void this.play(key);     // custom sound
    } else {
        void this.play("beep");  // default beep (respects customBeepSoundKey)
    }
}
```

- [ ] **Step 4: Extend `getKeysToPreload` to include category sounds**

In the `getKeysToPreload` method, after the existing trigger sound preloading block, add:

```typescript
const soundCategories: SoundCategories = (uiSettings as any)?.soundCategories ?? {};
Object.values(soundCategories).forEach((key) => {
    if (typeof key === "string" && key) {
        keys.add(key);
    }
});
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
yarn test --silent 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/client/SoundManager.ts test/client/Client.test.ts
git commit -m "feat(soundCategories): SoundManager resolves sound:category to actual sound key"
```

---

## Task 3: Migrate TS trigger scripts to `sound:category`

**Files:**
- Modify: `src/client/scripts/attackBeep.ts` + `test/client/scripts/attackBeep.test.ts`
- Modify: `src/client/scripts/hpAlert.ts` + `test/client/scripts/hpAlert.test.ts`
- Modify: `src/client/scripts/breakItem.ts` + `test/client/scripts/breakItem.test.ts`
- Modify: `src/client/scripts/buses.ts` + `test/client/scripts/buses.test.ts`
- Modify: `src/client/scripts/ships.ts` + `test/client/scripts/ships.test.ts`
- Modify: `src/client/scripts/fishing.ts`
- Modify: `src/client/scripts/lamp.ts`
- Modify: `src/client/scripts/warningTriggers.ts`
- Modify: `src/client/scripts/spells.ts`

- [ ] **Step 1: Update `attackBeep.ts`**

In `src/client/scripts/attackBeep.ts` line 72, replace:

```typescript
client.sendEvent("sound:play", { key: "beep" });
```

with:

```typescript
client.sendEvent("sound:category", "attack");
```

- [ ] **Step 2: Update `attackBeep.test.ts`**

In `test/client/scripts/attackBeep.test.ts` (lines 66-68 and 84-87), change all occurrences of:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
expect(beepCalls).toHaveLength(1);
expect(beepCalls[0][1]).toEqual({ key: 'beep' });
```

to:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
expect(beepCalls).toHaveLength(1);
expect(beepCalls[0][1]).toBe('attack');
```

And change:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
expect(beepCalls).toHaveLength(0);
```

to:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
expect(beepCalls).toHaveLength(0);
```

- [ ] **Step 3: Update `hpAlert.ts`**

In `src/client/scripts/hpAlert.ts` line 62, replace:

```typescript
client.sendEvent("sound:play", { key: "beep" });
```

with:

```typescript
client.sendEvent("sound:category", "hp");
```

- [ ] **Step 4: Update `hpAlert.test.ts`**

In `test/client/scripts/hpAlert.test.ts`, change every occurrence of:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
expect(beepCalls).toHaveLength(1);
expect(beepCalls[0][1]).toEqual({ key: 'beep' });
```

to:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
expect(beepCalls).toHaveLength(1);
expect(beepCalls[0][1]).toBe('hp');
```

Change every occurrence of:

```typescript
beepCalls.forEach(call => {
  expect(call[1]).toEqual({ key: 'beep' });
});
```

to:

```typescript
beepCalls.forEach(call => {
  expect(call[1]).toBe('hp');
});
```

Change:

```typescript
expect(client.sendEvent).not.toHaveBeenCalledWith('sound:play', expect.anything());
```

to:

```typescript
expect(client.sendEvent).not.toHaveBeenCalledWith('sound:category', expect.anything());
```

- [ ] **Step 5: Update `breakItem.ts`**

In `src/client/scripts/breakItem.ts` line 34, replace:

```typescript
client.sendEvent("sound:play", { key: "beep" });
```

with:

```typescript
client.sendEvent("sound:category", "gear");
```

- [ ] **Step 6: Update `breakItem.test.ts`**

In `test/client/scripts/breakItem.test.ts` line 27-29, replace:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
expect(beepCalls).toHaveLength(1);
expect(beepCalls[0][1]).toEqual({ key: 'beep' });
```

with:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
expect(beepCalls).toHaveLength(1);
expect(beepCalls[0][1]).toBe('gear');
```

- [ ] **Step 7: Update `buses.ts`**

In `src/client/scripts/buses.ts` line 14, replace:

```typescript
client.sendEvent("sound:play", {key: "beep"});
```

with:

```typescript
client.sendEvent("sound:category", "transport");
```

- [ ] **Step 8: Update `buses.test.ts`**

In `test/client/scripts/buses.test.ts`, replace all occurrences of:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
expect(beepCalls).toHaveLength(1);
expect(beepCalls[0][1]).toEqual({ key: 'beep' });
```

with:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
expect(beepCalls).toHaveLength(1);
expect(beepCalls[0][1]).toBe('transport');
```

Also replace:

```typescript
expect(client.sendEvent).toHaveBeenCalledWith('sound:play', expect.anything());
```

with:

```typescript
expect(client.sendEvent).toHaveBeenCalledWith('sound:category', 'transport');
```

- [ ] **Step 9: Update `ships.ts`**

In `src/client/scripts/ships.ts` line 15, replace:

```typescript
client.sendEvent("sound:play", { key: "beep" });
```

with:

```typescript
client.sendEvent("sound:category", "transport");
```

- [ ] **Step 10: Update `ships.test.ts`**

In `test/client/scripts/ships.test.ts`, replace:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
expect(beepCalls).toHaveLength(1);
expect(beepCalls[0][1]).toEqual({ key: 'beep' });
```

with:

```typescript
const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
expect(beepCalls).toHaveLength(1);
expect(beepCalls[0][1]).toBe('transport');
```

Replace:

```typescript
expect(client.sendEvent).not.toHaveBeenCalledWith('sound:play', expect.anything());
```

with:

```typescript
expect(client.sendEvent).not.toHaveBeenCalledWith('sound:category', expect.anything());
```

- [ ] **Step 11: Update `fishing.ts`**

In `src/client/scripts/fishing.ts` line 142, replace:

```typescript
client.sendEvent("sound:play", { key: "beep" });
```

with:

```typescript
client.sendEvent("sound:category", "fishing");
```

- [ ] **Step 12: Update `lamp.ts`**

In `src/client/scripts/lamp.ts` line 26, replace:

```typescript
client.sendEvent("sound:play", {key: "beep"})
```

with:

```typescript
client.sendEvent("sound:category", "lamp")
```

- [ ] **Step 13: Update `warningTriggers.ts`**

In `src/client/scripts/warningTriggers.ts` line 23, replace:

```typescript
client.sendEvent("sound:play", { key: "beep" });
```

with:

```typescript
client.sendEvent("sound:category", "gear");
```

- [ ] **Step 14: Update `spells.ts`**

There are 5 `sound:play` beep calls in `src/client/scripts/spells.ts`. Apply these replacements:

**Line 383** (weapon disarm from cold spell — weapon category):
```typescript
// Replace:
client.sendEvent("sound:play", { key: "beep" });
// In the "Twoje dlonie zaczynaja dretwiec" trigger handler, with:
client.sendEvent("sound:category", "weapon");
```

**Lines 581, 595, 609, 665** (dangerous spells on you — spell category). Each is in a trigger handler containing `formatSpellOnMe`. Replace each:
```typescript
client.sendEvent("sound:play", { key: "beep" });
```
with:
```typescript
client.sendEvent("sound:category", "spell");
```

- [ ] **Step 15: Run tests**

```bash
yarn test --silent 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 16: Commit**

```bash
git add \
  src/client/scripts/attackBeep.ts \
  src/client/scripts/hpAlert.ts \
  src/client/scripts/breakItem.ts \
  src/client/scripts/buses.ts \
  src/client/scripts/ships.ts \
  src/client/scripts/fishing.ts \
  src/client/scripts/lamp.ts \
  src/client/scripts/warningTriggers.ts \
  src/client/scripts/spells.ts \
  test/client/scripts/attackBeep.test.ts \
  test/client/scripts/hpAlert.test.ts \
  test/client/scripts/breakItem.test.ts \
  test/client/scripts/buses.test.ts \
  test/client/scripts/ships.test.ts
git commit -m "feat(soundCategories): migrate all TS trigger scripts to sound:category event"
```

---

## Task 4: Lua integration

**Files:**
- Modify: `src/client/scripts/luaGags.ts`
- Modify: `src/client/lua/color_bloki.lua`
- Modify: `src/client/lua/color_other.lua`
- Modify: `src/client/lua/color_ogluchy.lua`

- [ ] **Step 1: Update `luaGags.ts` — replace `playBeep` handler**

In `src/client/scripts/luaGags.ts`, add the import at the top of the file:

```typescript
import type { SoundCategory } from '@shared/events/clientEvents.ts';
```

Find the existing `playBeep` handler (lines 484-486):

```typescript
client.on("playBeep", () => {
    client.sendEvent("sound:play", { key: "beep" })
})
```

Replace it with:

```typescript
client.on("playSound", (category: string) => {
    client.sendEvent("sound:category", category as SoundCategory);
});
```

Keep the old `playBeep` handler as a fallback for any legacy scripts not yet migrated:

```typescript
client.on("playBeep", () => {
    client.sendEvent("sound:category", "attack" as SoundCategory);
});
```

> Note: The legacy `playBeep` fallback maps to `"attack"` arbitrarily — it will only remain until all Lua files are migrated (done in steps 2-4 of this task). After migration it becomes dead code but is harmless.

- [ ] **Step 2: Update `color_bloki.lua` — 5 occurrences**

In `src/client/lua/color_bloki.lua`, replace **all** occurrences of:

```lua
raiseEvent("playBeep")
```

with:

```lua
raiseEvent("playSound", "block")
```

And replace **all** occurrences of:

```lua
tempTimer(0.3, function () raiseEvent("playBeep") end)
```

with:

```lua
tempTimer(0.3, function () raiseEvent("playSound", "block") end)
```

There are 5 total replacements: lines 30, 31, 50, 119, 120.

- [ ] **Step 3: Update `color_other.lua` — 3 occurrences**

In `src/client/lua/color_other.lua`, replace **all** occurrences of:

```lua
raiseEvent("playBeep")
```

with:

```lua
raiseEvent("playSound", "weapon")
```

There are 3 total replacements: lines 37, 47, 86.

- [ ] **Step 4: Add stun beep to `color_ogluchy.lua`**

In `src/client/lua/color_ogluchy.lua`, in the function `trigger_func_skrypty_ui_gags_color_color_ogluchy_ogluch`, add `raiseEvent("playSound", "stun")` directly after `raiseEvent("stunStart")`:

```lua
function trigger_func_skrypty_ui_gags_color_color_ogluchy_ogluch()
    if scripts.gags:delete_line("ogluchy") then
        return
    end

    raiseEvent("stunStart")
    raiseEvent("playSound", "stun")
    selectCurrentLine()
    prefix("<red>[OGLUCH] ", cecho)    
    cecho("<red>\n\n[   OGLUCH   ] ----- JESTES OGLUSZONY -----\n\n")
    scripts.ui:info_action_update("OGLUSZONY")
    resetFormat()
end
```

- [ ] **Step 5: Remove legacy `playBeep` fallback from `luaGags.ts`**

Now that all Lua files are migrated, remove the legacy fallback added in Step 1:

```typescript
// Remove this block:
client.on("playBeep", () => {
    client.sendEvent("sound:category", "attack" as SoundCategory);
});
```

- [ ] **Step 6: Run tests**

```bash
yarn test --silent 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add \
  src/client/scripts/luaGags.ts \
  src/client/lua/color_bloki.lua \
  src/client/lua/color_other.lua \
  src/client/lua/color_ogluchy.lua
git commit -m "feat(soundCategories): migrate Lua scripts to raiseEvent(playSound, category)"
```

---

## Task 5: UI HTML — category dropdowns

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add sound category section to `index.html`**

Find the existing Dźwięk section in `index.html` (around line 628-640):

```html
<section class="ui-settings-section">
    <h6 class="ui-settings-section-title">Dźwięk</h6>
    <div class="ui-settings-stack">
        <div>
            <label class="form-label" for="ui-custom-beep-sound">Własny dźwięk beep</label>
            <select id="ui-custom-beep-sound" class="form-select">
                <option value="">Domyślny beep</option>
            </select>
            <input id="ui-custom-beep-file" type="file" accept="audio/*" style="display: none;" />
        </div>
        <button type="button" class="btn btn-secondary btn-sm align-self-start" id="ui-manage-sounds-button">Zarządzaj dźwiękami</button>
    </div>
</section>
```

Add the following new section immediately after it (before the next `<section>`):

```html
<section class="ui-settings-section">
    <h6 class="ui-settings-section-title">Kategorie dźwięków</h6>
    <div class="ui-settings-stack">
        <div>
            <label class="form-label" for="ui-sound-category-attack">Atak</label>
            <select id="ui-sound-category-attack" class="form-select">
                <option value="">Domyślny beep</option>
                <option value="__disabled__">Wyciszony</option>
            </select>
        </div>
        <div>
            <label class="form-label" for="ui-sound-category-hp">Punkty życia</label>
            <select id="ui-sound-category-hp" class="form-select">
                <option value="">Domyślny beep</option>
                <option value="__disabled__">Wyciszony</option>
            </select>
        </div>
        <div>
            <label class="form-label" for="ui-sound-category-fishing">Wędkarstwo</label>
            <select id="ui-sound-category-fishing" class="form-select">
                <option value="">Domyślny beep</option>
                <option value="__disabled__">Wyciszony</option>
            </select>
        </div>
        <div>
            <label class="form-label" for="ui-sound-category-lamp">Lampa</label>
            <select id="ui-sound-category-lamp" class="form-select">
                <option value="">Domyślny beep</option>
                <option value="__disabled__">Wyciszony</option>
            </select>
        </div>
        <div>
            <label class="form-label" for="ui-sound-category-gear">Sprzęt</label>
            <select id="ui-sound-category-gear" class="form-select">
                <option value="">Domyślny beep</option>
                <option value="__disabled__">Wyciszony</option>
            </select>
        </div>
        <div>
            <label class="form-label" for="ui-sound-category-transport">Transport</label>
            <select id="ui-sound-category-transport" class="form-select">
                <option value="">Domyślny beep</option>
                <option value="__disabled__">Wyciszony</option>
            </select>
        </div>
        <div>
            <label class="form-label" for="ui-sound-category-spell">Czary</label>
            <select id="ui-sound-category-spell" class="form-select">
                <option value="">Domyślny beep</option>
                <option value="__disabled__">Wyciszony</option>
            </select>
        </div>
        <div>
            <label class="form-label" for="ui-sound-category-block">Blokowanie</label>
            <select id="ui-sound-category-block" class="form-select">
                <option value="">Domyślny beep</option>
                <option value="__disabled__">Wyciszony</option>
            </select>
        </div>
        <div>
            <label class="form-label" for="ui-sound-category-weapon">Broń</label>
            <select id="ui-sound-category-weapon" class="form-select">
                <option value="">Domyślny beep</option>
                <option value="__disabled__">Wyciszony</option>
            </select>
        </div>
        <div>
            <label class="form-label" for="ui-sound-category-stun">Ogłuszenie</label>
            <select id="ui-sound-category-stun" class="form-select">
                <option value="">Domyślny beep</option>
                <option value="__disabled__">Wyciszony</option>
            </select>
        </div>
    </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat(soundCategories): add category sound dropdowns to UI settings HTML"
```

---

## Task 6: UI logic — read/write `soundCategories`

**Files:**
- Modify: `src/web/uiSettings.ts`

The categories and their DOM IDs:

```
attack    → #ui-sound-category-attack
hp        → #ui-sound-category-hp
fishing   → #ui-sound-category-fishing
lamp      → #ui-sound-category-lamp
gear      → #ui-sound-category-gear
transport → #ui-sound-category-transport
spell     → #ui-sound-category-spell
block     → #ui-sound-category-block
weapon    → #ui-sound-category-weapon
stun      → #ui-sound-category-stun
```

- [ ] **Step 1: Add imports at the top of `uiSettings.ts`**

Add these imports near the top of `src/web/uiSettings.ts` (alongside other type imports):

```typescript
import type { SoundCategory } from '@shared/events/clientEvents.ts';
import type { SoundCategories } from './defaultUiSettings';
```

- [ ] **Step 2: Add `ALL_SOUND_CATEGORIES` constant**

Near the top of the file (after imports), add:

```typescript
const ALL_SOUND_CATEGORIES: SoundCategory[] = [
    'attack', 'hp', 'fishing', 'lamp', 'gear',
    'transport', 'spell', 'block', 'weapon', 'stun',
];
```

- [ ] **Step 3: Wire up category select elements in the setup function**

In the function that queries the modal DOM elements (where `customBeepSoundInput` is queried, around line 587), add:

```typescript
const categorySelects: Partial<Record<SoundCategory, HTMLSelectElement>> = {};
ALL_SOUND_CATEGORIES.forEach(cat => {
    const el = modalEl.querySelector(`#ui-sound-category-${cat}`) as HTMLSelectElement | null;
    if (el) categorySelects[cat] = el;
});
```

- [ ] **Step 4: Add `soundCategories` to the settings parse block**

In the parsing section (near the `customBeepSoundKey` parsing around line 420), add after the `customBeepSoundKey` block:

```typescript
const soundCategories: SoundCategories = {};
if (parsed?.soundCategories && typeof parsed.soundCategories === 'object') {
    ALL_SOUND_CATEGORIES.forEach(cat => {
        const val = (parsed.soundCategories as any)[cat];
        if (val === null) {
            soundCategories[cat] = null;
        } else if (typeof val === 'string' && val) {
            soundCategories[cat] = val;
        }
    });
}
```

Include `soundCategories` in the returned settings object from the same parse block (it is spread into `current` at the end of the parse function):

```typescript
soundCategories,
```

- [ ] **Step 5: Add `populateCategoryOptions` function**

Add this function alongside `populateCustomBeepOptions` (around line 783):

```typescript
const populateCategoryOptions = () => {
    ALL_SOUND_CATEGORIES.forEach(cat => {
        const select = categorySelects[cat];
        if (!select) return;
        const currentValue = select.value;
        // Remove existing custom sound options (keep first two: default + disabled)
        while (select.options.length > 2) {
            select.remove(2);
        }
        customSounds.forEach(sound => {
            const option = document.createElement('option');
            option.value = sound.key;
            option.textContent = sound.name;
            select.appendChild(option);
        });
        if (currentValue) {
            select.value = currentValue;
        }
    });
};
```

- [ ] **Step 6: Call `populateCategoryOptions` wherever `populateCustomBeepOptions` is called**

Find every call to `populateCustomBeepOptions()` in `uiSettings.ts` and add a call to `populateCategoryOptions()` immediately after each one.

- [ ] **Step 7: Populate category selects when the modal opens**

In the section that sets initial values from `settings` (where `customBeepSoundInput.value = settings.customBeepSoundKey` is set, around line 895), add:

```typescript
ALL_SOUND_CATEGORIES.forEach(cat => {
    const select = categorySelects[cat];
    if (!select) return;
    const catValue = settings.soundCategories?.[cat];
    if (catValue === null) {
        select.value = '__disabled__';
    } else if (typeof catValue === 'string' && catValue) {
        select.value = catValue;
    } else {
        select.value = '';
    }
});
```

- [ ] **Step 8: Include `soundCategories` in the `read()` function**

In the `read()` function (around line 1484 where the settings object is assembled), add:

```typescript
soundCategories: (() => {
    const result: SoundCategories = {};
    ALL_SOUND_CATEGORIES.forEach(cat => {
        const select = categorySelects[cat];
        if (!select) return;
        const value = select.value;
        if (value === '__disabled__') {
            result[cat] = null;
        } else if (value && value !== '') {
            result[cat] = value;
        }
        // empty string = omit = default beep
    });
    return result;
})(),
```

- [ ] **Step 9: Verify build is clean**

```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit
```

Expected: no output from `tsc`.

- [ ] **Step 10: Run all tests**

```bash
yarn test --silent 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/web/uiSettings.ts
git commit -m "feat(soundCategories): wire UI settings to read/write soundCategories per category"
```

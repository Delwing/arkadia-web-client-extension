# Storage API Redesign

## Problem Statement

The current storage layer (`src/modules/core/storage.ts`) has accumulated significant
technical debt. It conflates multiple concerns (character scoping, change notification,
HTTP caching, JSON serialization) into one module with an inconsistent API surface.

### Current Pain Points

1. **Hidden character scoping via a manually maintained key set** — callers pass a plain key
   like `"settings"` and the storage layer silently rewrites it to `"Alice:settings"` based
   on a hardcoded `Set`. Adding a new character-scoped key means editing `storage.ts`.
   Forgetting to add a key causes silent data leakage between characters.

2. **Wrapped return values** — `getItem("settings")` returns `{ settings: value }` instead
   of `value`. Every consumer must unwrap: `getItemSync("clock_active_domain")?.clock_active_domain`.
   This was inherited from the Chrome extension `chrome.storage` API shape but no longer serves
   a purpose.

3. **Duplicate sync/async code paths** — `LocalStorage.getItem()` wraps synchronous
   `localStorage` in `Promise.resolve()`. The bolted-on `getItemSync`/`setItemSync` functions
   duplicate the same logic outside the class and cast `(storage as any).listeners` to fire
   change events.

4. **`downloadItem` mixed into storage interface** — HTTP fetching with TTL caching is an
   unrelated concern baked into the `Storage` interface.

5. **`any` everywhere** — No generics, no type safety. Runtime bugs from wrong key names or
   mismatched types are only caught by manual testing.

6. **Three parallel key registries** — `characterScopedKeys` in `storage.ts`,
   `KNOWN_GLOBAL_KEYS` in `exportUtils.ts`, and `EXPORT_SPECIFIC_GLOBAL_KEYS` in
   `exportUtils.ts` must all be kept in sync manually.

7. **`notifyCharacterChange` has hardcoded special cases** — Lines 66-68 single out
   `settings` and `peopleLocalEvents` as keys that "always fire even if newRaw is null".
   This grows ad-hoc with each new feature.

8. **`:` separator collision** — `stripCharacterScope` splits on the first `:`. A character
   named `http` would make URL cache keys ambiguous. The `IGNORED_CHARACTER_KEY_PREFIXES`
   set in `exportUtils.ts` is a bandaid for this.

9. **Direct localStorage access** — 14 files bypass the storage abstraction entirely
   (141 direct `localStorage` calls), getting none of the character scoping, change
   notification, or serialization benefits.

---

## Proposed Design

### Core Principle: Two Explicit Storage Namespaces

Instead of a hidden scoping mechanism, the API makes the distinction **explicit at the call site**:

```ts
import { characterStorage, globalStorage } from '@modules/core/storage';

// Character-scoped: reads "Alice:settings" when character is "Alice"
const settings = characterStorage.get('settings');
characterStorage.set('settings', { attackCommand: 'atak' });

// Global: reads "uiSettings" directly
const ui = globalStorage.get('uiSettings');
globalStorage.set('uiSettings', { showButtons: true });
```

No hidden set. No silent rewriting. The caller decides.

### Type-Safe Key Registries

Each namespace defines its schema:

```ts
// src/modules/core/storageSchema.ts

interface CharacterStorageSchema {
    settings: Settings;
    kill_counter: Record<string, number>;
    improve_counter_lifetime: Record<string, number>;
    deposits: DepositData;
    containers: ContainerData;
    herb_counts: HerbCountData;
    herbs_data: HerbsData;
    mapperRoomId: number;
    lastLang: string;
    object_num: string;
    clock_active_domain: string;
    language_max_levels: Record<string, number>;
    profession: ProfessionState;
    introduced_remembered: string[];
    introduced_presented: string[];
    peopleLocalEvents: PeopleLocalEvent[];
    lua_gags_delete_lines: LuaGagsDeleteLinesSettings;
    lua_gags_colors: LuaGagsColorsSettings;
    lua_gags_walka_config: LuaGagsWalkaConfig;
    attack_mode: AttackMode;
    chat_history: ChatEntry[];
    contracts: ContractSnapshot;
}

interface GlobalStorageSchema {
    uiSettings: UiSettings;
    binds: BindSettings;
    shortcuts: ShortcutData[];
    triggers: TriggerData[];
    aliases: AliasData[];
    mobileButtonSettings: MobileButtonSettings;
    desktopButtonSettings: DesktopButtonSettings;
    scripts: ScriptData[];
    stored_scripts: StoredScript[];
    loggingEnabled: boolean;
    keymaps: KeymapStore;
    active_keymap_id: string;
    currentCharacter: string;
    layoutManagerState: LayoutState;
    deviceInfo: DeviceInfo;
    objectsListPosition: Position;
    mobileButtonsPosition: Position;
    settingsMigrationsVersion: number;
    custom_sounds: CustomSound[];
}
```

Benefits:
- **Compile-time safety**: `characterStorage.get('typo')` is a type error.
- **Self-documenting**: The schema IS the registry. No separate `Set` to maintain.
- **`exportUtils` derives from the schema** instead of maintaining parallel lists.
- **IDE autocomplete** for all storage keys.

### Unified Sync API

Since we're on `localStorage` (not `chrome.storage`), drop the fake async wrapper entirely:

```ts
class TypedStorage<TSchema> {
    get<K extends keyof TSchema & string>(key: K): TSchema[K] | undefined;
    set<K extends keyof TSchema & string>(key: K, value: TSchema[K]): void;
    remove<K extends keyof TSchema & string>(key: K): void;
    onChange<K extends keyof TSchema & string>(
        key: K,
        listener: (newValue: TSchema[K] | undefined, oldValue: TSchema[K] | undefined) => void
    ): () => void;
}
```

- Returns `TSchema[K] | undefined` directly — no `{ [key]: value }` wrapping.
- Synchronous — matches the underlying storage.
- Per-key listeners instead of a single listener that receives a bag of changes.
- Returns an unsubscribe function.

### Character Management

```ts
// Character switching is a first-class operation
characterStorage.setCharacter('Alice');
characterStorage.getCharacter();  // 'Alice'

// Character switch fires per-key change events automatically
// No special-case logic needed — the listener infra handles it
```

The `notifyOnNull` behavior (currently hardcoded for `settings` and `peopleLocalEvents`)
becomes a per-key option in the schema:

```ts
interface CharacterStorageKeyOptions {
    /** Fire change event even when the new character has no value for this key */
    notifyOnNull?: boolean;
    /** Default value to return when key is absent */
    defaultValue?: unknown;
}
```

### Separate HTTP Cache

Move `downloadItem` / `download()` to its own module:

```ts
// src/modules/core/httpCache.ts
export async function fetchWithCache(url: string, ttlMs: number): Promise<unknown> { ... }
```

### Migration Strategy

The new API can coexist with the old one. Migration is incremental:

1. **Phase 1**: Create `TypedStorage`, `characterStorage`, `globalStorage`. Keep old
   `storage` default export working but internally delegate to the new implementation.
   `getItemSync`/`setItemSync` become thin wrappers.

2. **Phase 2**: Migrate consumers file-by-file. Each migration:
   - Replaces `getItemSync('key')?.key` → `characterStorage.get('key')`
   - Replaces `storage.getItem('key').then(d => d?.key)` → `characterStorage.get('key')`
   - Replaces direct `localStorage.getItem(...)` for known keys → appropriate namespace

3. **Phase 3**: Remove old exports. Delete `characterScopedKeys` set, `downloadItem`,
   `{ [key]: value }` wrapping.

### Impact on Export/Import

`exportUtils.ts` currently iterates all `localStorage` keys and uses heuristics to detect
character-scoped keys (split on `:`, check against `IGNORED_CHARACTER_KEY_PREFIXES`).

With the new design:
- `Object.keys(CharacterStorageSchema)` gives all character-scoped key names.
- `Object.keys(GlobalStorageSchema)` gives all global key names.
- No heuristic parsing needed.

### Impact on MockPort

`MockPort.postMessage` currently handles `SET_STORAGE`/`GET_STORAGE` messages by calling
`setItemSync`/`getItemSync`. With the new API:

```ts
postMessage(message: any) {
    if (message.type === 'SET_STORAGE') {
        // Determine namespace from key
        if (isCharacterKey(message.key)) {
            characterStorage.set(message.key, message.value);
        } else {
            globalStorage.set(message.key, message.value);
        }
    }
}
```

The `isCharacterKey` check can be derived from the schema type at compile time.

### Impact on Cross-Tab Sync

The `window.addEventListener('storage', ...)` handler currently uses `stripCharacterScope`
to map raw localStorage keys back to logical keys. With the new design, the storage class
knows its prefix strategy and can do this mapping internally without a separate stripping
function.

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/modules/core/storageSchema.ts` | **New** — type definitions for both schemas |
| `src/modules/core/storage.ts` | **Rewrite** — `TypedStorage` class, `characterStorage`/`globalStorage` instances |
| `src/modules/core/httpCache.ts` | **New** — extracted `fetchWithCache` |
| `src/modules/core/storage.ts` (old exports) | **Deprecate** — thin wrappers during migration |
| `src/web/MockPort.ts` | Update to use new API |
| `src/ui/web/hooks/useLocalStorage.ts` | Simplify — no more unwrapping |
| `src/web/options/exportUtils.ts` | Derive key lists from schema instead of hardcoded sets |
| `src/modules/core/keymapStorage.ts` | Replace direct `localStorage` with `globalStorage` |
| `src/modules/device/deviceStorage.ts` | Replace direct `localStorage` with `globalStorage` |
| `src/modules/device/syncGroup.ts` | Replace direct `localStorage` with `globalStorage` |
| ~30 consumer files | Replace `getItemSync('x')?.x` → `characterStorage.get('x')` |

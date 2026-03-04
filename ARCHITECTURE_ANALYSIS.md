# Architecture Analysis & Improvement Suggestions

## Project Overview

**Arkadia Web Client Extension** is a feature-rich web-based MUD (Multi-User Dungeon) client for the Arkadia game, built as a single-page application with ~137K lines of TypeScript. It provides terminal emulation, map rendering, combat automation, plugin support, and extensive game-specific scripting.

---

## Current Architecture

### High-Level Structure

```
src/
├── client/          # Core game client logic (triggers, aliases, scripts)
│   ├── Client.ts    # God object - central hub for all game interactions
│   ├── Triggers.ts  # Pattern matching engine for game output
│   ├── scripts/     # ~130 game feature scripts (combat, herbs, maps, etc.)
│   └── utils/       # Shared utilities
├── web/             # Web UI layer (React popups, layout, options pages)
│   ├── main.ts      # Web entry point (~600 lines of initialization)
│   ├── layout/      # Dockable panel system
│   ├── options/     # Settings UI components
│   └── hooks/       # React hooks
├── modules/         # Shared modules
│   ├── core/        # EventBus, storage, colors, settings
│   ├── data/        # DataStore pattern, data loading strategies
│   ├── device/      # Device sync/settings
│   └── firebase/    # Cloud sync via Firebase
├── shared/          # Cross-cutting concerns (events, map, recorder, socket)
└── ui/web/          # Migrated React components (panels, timers, hooks)

editor/              # Plugin editor (Monaco-based IDE)
viewer/              # Map viewer standalone app
e2e/                 # Playwright E2E tests
test/                # Jest unit tests
```

### Build System
- **Vite** for development/production builds with React plugin
- **3 entry points**: client (main app), editor (plugin IDE), viewer (map viewer)
- **Manual chunk splitting**: Firebase, map renderer, esbuild-wasm, JSZip, SQL.js, Lua
- **Webpack** still present in devDependencies (likely legacy, only used for plugin bundling)
- **Jest** for unit tests, **Playwright** for E2E

### Core Patterns

1. **Event Bus** (`modules/core/eventBus.ts`): Central typed pub/sub system (`EventBus<ClientEvents>`) used by all components. Well-implemented with dedup, once, AbortSignal support.

2. **Script Registration** (`client/main.ts`): 130+ `init*()` functions imperatively registered in `registerScripts()`. Each script receives the `Client` instance and registers triggers/aliases.

3. **Storage** (`modules/core/storage.ts`): localStorage wrapper with character-scoped keys, change listeners, and a Chrome extension-like API surface.

4. **DataStore** (`modules/data/dataStore/`): Strategy-based store with loader/storage strategies, TTL, progress tracking. Well-designed for async data management.

5. **Layout System** (`web/layout/`): Dockable panel system with floating panels, drag-and-drop, persistence.

---

## Key Findings & Improvement Suggestions

### 1. God Object: `Client.ts`

**Problem**: `Client` is a 690-line class that acts as a service locator, event dispatcher, command processor, key binding handler, DOM manipulator, and notification manager — all in one. Scripts attach to it via monkey-patching (e.g., `(client as any).killCounter = killCounter`).

**Suggestions**:
- **Extract KeyBindingManager**: Move the `keydown` handler and bind management (~100 lines) into a dedicated class.
- **Extract CommandProcessor**: The `sendCommand()` chain (hooks → polish character stripping → map parsing → object shortcuts → alias matching → movement) should be its own class with clear middleware-like stages.
- **Extract NotificationManager**: `notify()`, `enableNotifications()`, and service worker registration into a separate module.
- **Use dependency injection** instead of the Client acting as a service locator. Scripts could receive specific interfaces rather than the entire Client.

### 2. Script Registration Monolith

**Problem**: `client/main.ts` has 130 imports and a single `registerScripts()` function with 130+ imperative `init*()` calls. Adding/removing features requires editing this file. There's no way to conditionally load scripts or manage dependencies between them.

**Suggestions**:
- **Declarative script registry**: Define scripts as objects with metadata (dependencies, feature flags, settings keys) and use an auto-discovery/registration pattern:
  ```typescript
  // Each script exports metadata
  export const script: ScriptDefinition = {
    id: 'hpAlert',
    init: (client) => { ... },
    dependsOn: [],
    settingsKey: 'lowHpAlert',
  };
  ```
- **Lazy loading**: Group scripts by category (combat, navigation, crafting, social) and lazy-load non-essential ones after initial connection.
- **Feature flags**: Allow users to enable/disable individual scripts via settings, reducing memory/CPU for unused features.

### 3. Weak Type Safety in Event System

**Problem**: While `ClientEvents` provides type definitions for ~200 events, many handlers cast to `any` (e.g., `const detail = (settings ?? {}) as Record<string, any>`). The `gmcp.*` events use `unknown` for most payloads. The `sendEvent()` method has an overload that accepts `string` with `unknown[]` args, bypassing type safety entirely.

**Suggestions**:
- **Define GMCP payload types**: Create interfaces for frequently-used GMCP events (`gmcp.char.state`, `gmcp.char.info`, `gmcp.objects.data`, etc.) and add them to `ClientEvents`.
- **Remove the string overload** on `sendEvent()` or make it emit a compile-time warning.
- **Create typed setting interfaces** instead of using `Record<string, any>` for settings objects.

### 4. Storage Layer Fragility

**Problem**: `storage.ts` uses `localStorage` with JSON serialization but has several concerns:
- Character-scoped keys use string concatenation (`${name}:${key}`) — fragile if character names contain colons.
- `getItemSync()` wraps values in `{[key]: value}` objects, creating an unusual API surface.
- The `download()` function mixes caching with fetching in a confusing way (returns `{value, cacheTime, ttl}` wrapper sometimes).
- `setItemSync()` uses `(storage as any).listeners` to access private members.

**Suggestions**:
- **Use a separator that can't appear in character names** (e.g., `\0` or a UUID namespace).
- **Simplify the API**: `getItem(key)` should return the value directly, not `{[key]: value}`.
- **Extract the download/cache concern** into a separate `CachedFetcher` class.
- **Make listener access type-safe** by exposing a proper method on the storage class.

### 5. web/main.ts Initialization Complexity

**Problem**: `src/web/main.ts` is ~600+ lines of imperative initialization that creates the client, sets up WebSocket, mounts React components, registers event listeners, and wires up dozens of UI features. It's the web equivalent of the script registration problem.

**Suggestions**:
- **Extract initialization phases**: Break into `createClient()`, `initializeUI()`, `connectSocket()`, `mountComponents()` functions in separate files.
- **Use a lifecycle/boot system** where modules register themselves for specific boot phases.

### 6. Duplicate Component Locations

**Problem**: React components live in three different directories:
- `src/ui/web/components/` — "migrated" components (panels, timers)
- `src/web/` — popups, layouts, options (majority of UI)
- `src/web/layout/components/` — layout-specific components

The `ui/web` directory appears to be a migration target that's only partially complete.

**Suggestions**:
- **Complete the migration** or abandon it — having two component trees creates confusion about where to add new components.
- **Establish a clear convention**: e.g., `ui/` for presentational components, `web/` for page-level containers.

### 7. Missing Dependency Injection / Module Boundaries

**Problem**: Modules import directly across boundaries (e.g., `@client/scripts/commandPreserveCaseMode` imported in `@shared/events`). The `shared` directory imports from `client`, and `client` imports from `shared`, creating circular dependency risks.

**Suggestions**:
- **Enforce import boundaries**: Use ESLint rules (e.g., `eslint-plugin-import` with `no-restricted-imports`) to prevent `shared` from importing `client`.
- **Move shared types** (like `CommandOptions`) to `shared/types/` and have both `client` and `web` depend on them.

### 8. Test Coverage Gaps

**Problem**: Unit tests exist for many scripts but the test structure mirrors the old source layout. There are no tests for:
- `EventBus` edge cases (though basic behavior is tested)
- `DataStore` (has 1 test file)
- Layout system
- Firebase sync
- Plugin system integration

**Suggestions**:
- **Prioritize testing for data integrity paths**: storage, firebase sync, export/import.
- **Add integration tests** for the plugin lifecycle (load, init, destroy).
- **Test the DataStore strategies** individually (IndexedDB, fetch, worker).

### 9. Bundle Size Concerns

**Problem**: The app bundles several heavy dependencies:
- Firebase SDK (~200KB gzipped)
- Monaco Editor (~2MB)
- esbuild-wasm (~8MB)
- mudlet-map-renderer + Konva
- SQL.js (WebAssembly SQLite)
- Lua interpreter

The `chunkSizeWarningLimit: 5000` (5MB) is set very high, masking real bundle issues.

**Suggestions**:
- **Lazy-load Firebase**: Only import when user enables cloud sync.
- **Lazy-load Monaco + esbuild**: Only needed in the editor entry point (already separate, but verify no main app imports).
- **Consider lighter alternatives** to SQL.js if it's only used for specific data queries.
- **Lower the chunk warning limit** to 1MB to catch regressions.

### 10. Error Handling

**Problem**: The EventBus silently swallows all errors in handlers (`catch (_err) {}`). Many async operations use `.catch(() => {})`. This makes debugging production issues very difficult.

**Suggestions**:
- **Log swallowed errors** at minimum: `console.error('[EventBus]', event, err)` in development.
- **Add an error reporting boundary** for critical paths (storage writes, firebase sync).
- **Replace silent `.catch(() => {})` with `.catch(err => console.warn(...))** in non-trivial operations.

---

## Architecture Strengths

1. **Well-designed DataStore pattern** with strategy interfaces for loading and storage — extensible and testable.
2. **Typed event system** with 200+ event definitions providing good IntelliSense support.
3. **Plugin architecture** supporting ES modules with a clean API surface (`PluginApi`).
4. **Comprehensive E2E test suite** with 60+ Playwright spec files covering major features.
5. **Good use of Web Workers** for heavy operations (data import, log export, people parsing).
6. **Clean path aliases** (`@client`, `@web`, `@shared`, `@modules`) improving import readability.
7. **Manual chunk splitting** strategy showing awareness of bundle optimization.
8. **Dockable layout system** with persistence — sophisticated UI engineering.

---

## Priority Recommendations (by impact/effort ratio)

| Priority | Improvement | Impact | Effort |
|----------|------------|--------|--------|
| 1 | Add error logging to EventBus + silent catches | High | Low |
| 2 | Define typed GMCP interfaces | High | Low |
| 3 | Extract KeyBindingManager from Client | Medium | Low |
| 4 | Enforce import boundaries with ESLint | Medium | Low |
| 5 | Lazy-load Firebase SDK | High | Medium |
| 6 | Break up web/main.ts initialization | Medium | Medium |
| 7 | Declarative script registry | High | Medium |
| 8 | Complete component migration or consolidate | Medium | Medium |
| 9 | Simplify storage API | Medium | Medium |
| 10 | Extract CommandProcessor from Client | High | High |

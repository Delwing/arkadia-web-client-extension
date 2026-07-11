# Client ↔ UI Decoupling

The game client (`src/client`) is UI-agnostic. It knows how to talk to Arkadia
— transport, telnet/GMCP, triggers, ANSI rendering, combat/team/object state,
plugins — but it knows **nothing** about React, the DOM, or the stock web app.
A UI is something you plug *around* the client, not something the client depends
on. This is what makes it possible to build a second UI (see `alt-ui/`) that
drives the real client with none of the stock chrome.

This document explains the seam and how to build a UI on top of it.

## The layers

```
        ┌─────────────────────────────────────────────┐
        │  UI  (src/web, alt-ui, or your own)          │
        │   - renders output, panels, input            │
        │   - injects ports at bootstrap               │
        └───────────────┬─────────────────────────────┘
        injected ports   │   events + accessors
        (@client/ports)  │   (eventBus, @modules/core/settings)
        ┌───────────────▼─────────────────────────────┐
        │  Client core  (src/client)                   │
        │   - transport, triggers, GMCP, plugins       │
        │   - DOM-free, no @web imports at runtime      │
        └───────────────┬─────────────────────────────┘
                         │
        ┌───────────────▼─────────────────────────────┐
        │  Shared engines  (@modules)                  │
        │   core (storage/settings/eventBus),          │
        │   data (stores), firebase (sync), device     │
        └─────────────────────────────────────────────┘
```

The client talks **up** to the UI only through four narrow channels:

| Channel | Direction | What it's for |
|---|---|---|
| **Injected ports** (`@client/ports`) | UI → client (impl), client → UI (call) | Transient UI the client requests: tooltips, context menus, plugin popups. |
| **Event bus** (`@modules/core/eventBus`) | client → UI | Everything the UI reacts to: game output, GMCP state, connection status. |
| **Settings accessors** (`@modules/core/settings`) | both | Concern-scoped read/write of preferences. |
| **Direct method calls** (`Client` instance) | UI → client | Sending commands, pushing content width, connecting. |

Nothing else crosses the line. In particular, the client never reaches into the
DOM and never imports `@web`.

## The enforced boundary

`src/client/**` may not import `@web`/`@web-ui` at runtime. This is an ESLint
rule (`eslint.config.js`), not a convention:

```
'@typescript-eslint/no-restricted-imports': ['error', {
  patterns: [{ group: ['@web', '@web/*', '@web-ui', '@web-ui/*'],
               allowTypeImports: true }]
}]
```

Type-only imports are still permitted (they erase at build time). A few UI types
are still referenced this way from `src/client` and are tracked as follow-up
cleanups — relocating them to `@shared` would make the boundary type-clean too:

- `PluginApi.ts` — `MobileButtonSetting`, `ObjectListEntryFilter`/`EntryContext`/`FilterResult`
- `ports/pluginHostPort.ts` — `PluginPopupConfig`

## The ports

Ports invert the dependency: the client declares an interface and calls a
getter; the UI injects an implementation once at bootstrap. The default is a
**no-op**, so the client runs headless (an alt UI with no tooltips just doesn't
set them).

### `UiPort` — transient UI (`src/client/ports/uiPort.ts`)

```ts
interface UiPort {
  showHerbTooltip(herbId, actions, x, y): void;
  hideHerbTooltip(): void;
  showBookTooltip(categories, x, y): void;
  hideBookTooltip(): void;
  showContextMenu(items, x, y, options?): void;
}
setUiPort(port);   // UI installs its implementation
getUiPort();       // client core reads it (no-op until set)
```

`ContextMenuEntry.label` is deliberately `string | Node` — no React types — so
the client can build menu entries without depending on the web UI. A UI widens
this to its own richer entry type when it renders.

### `PluginHostPort` — plugin-host capabilities (`src/client/ports/pluginHostPort.ts`)

Web-UI-specific capabilities the plugin API needs but that the surrounding UI
owns: the default UI-settings shape and the plugin-popup lifecycle. Optional —
a UI without plugin popups can skip `setPluginHostPort` entirely and the plugin
API falls back to the no-op (empty defaults, popups no-op).

## The event bus

`@modules/core/eventBus` is the typed bus (events defined in
`src/shared/events/`). `Client.on(...)` delegates to it, so a UI can subscribe
with either. Key events a UI typically consumes:

| Event | Payload | Use |
|---|---|---|
| `message` | `string \| AnsiAwareBuffer`, `type?` | Game output line. `AnsiAwareBuffer.toDom()` renders ANSI; `type` tags it (`room.short`, `other`, …). |
| `gmcp.char.state` | vitals | HP/fatigue/mana/… for status bars. |
| `gmcp.char.options` | options | e.g. form. |
| `gmcp.objects.nums` / `gmcp.objects.data` | object nums / data map | Room object list. **Subscribe to `nums` too** — a room clear arrives as a nums-only packet. |
| `parsedObjects` | — | Emitted after an objects *data* update (not on a nums-only clear). |
| `enterLocation` | `{ id }` | Movement; drive map/exits. |
| `mapLocationLabel` | `string` | Current location label. |
| `client.connect` / `client.disconnect` | — | Connection status. |

## Settings

Preferences are split into concern-scoped slices behind stable accessors at
`@modules/core/settings`. A UI binds to an accessor, never to a storage key:

```ts
import { getRenderSettings, setRenderSettings, onRenderSettingsChange } from '@modules/core/settings';
// also: get/set/onChange for Map, Shell, Behavior
```

| Accessor | Slice (`@shared/uiSettingsTypes`) | Examples |
|---|---|---|
| `*RenderSettings` | `RenderSettings` | fonts, `xtermPalette`, `outputBackground`, timestamps, command echo, sounds |
| `*MapSettings` | `MapSettings` | `mapScale`, room size/shape, marker, colours, pathfinding |
| `*ShellSettings` | `ShellSettings` | `wakeLock`, `fightTitleIcon`, haptics |
| `*BehaviorSettings` | `BehaviorSettings` | exploration/instant move, team numbering, object menu commands |

Each accessor `get()` default-merges its slice; `set(patch)` writes only its own
slice; `onChange(cb)` fires on slice changes. Stock-only chrome (buttons,
footer, layout, split view, bar order, …) stays in the `uiSettings` blob and is
ignored by alt UIs. These slice keys are shared and sync across devices via the
Firebase category registry; see `SYNCHRONIZACJA.md`.

## Building a UI

A UI is an HTML entry + a bootstrap module. The minimal recipe (see
`alt-ui/main.ts` for a full example):

```ts
import mudClient from '@web/MudClient';        // transport (WebSocket/telnet-proxy)
import Client from '@client/Client';
import { registerScripts } from '@client/main';
import { setUiPort } from '@client/ports';
import { installContentWidthMeasurer } from '@web/contentWidthMeasurer';
import eventBus from '@modules/core/eventBus';

// 1. Inject the port(s). No-op is fine if you don't render tooltips/menus.
setUiPort({
  showHerbTooltip() {}, hideHerbTooltip() {},
  showBookTooltip() {}, hideBookTooltip() {},
  showContextMenu(items) { /* your menu */ },
});

// 2. Build the client and register the feature scripts.
const client = new Client(mudClient);
registerScripts(client);

// 3. The client is DOM-free: it can't measure your output column, so push the
//    character cell width in. This helper wires a ResizeObserver for you.
installContentWidthMeasurer(client);

// 4. Subscribe to the bus and render however you like.
eventBus.on('message', (msg, type) => { /* append to your output element */ });

// 5. Drive the client from your input.
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') client.sendCommand(input.value, /* echo */ true);
});
```

Add the entry to `vite.config.ts` `rollupOptions.input` so it builds.

### What you must provide vs. what you get free

**You provide:** an output surface and a render loop for `message`; an input
element wired to `client.sendCommand`; a way to connect (`mudClient.connect()`);
the character-width feed (`installContentWidthMeasurer`); and — if you want them
— port implementations for tooltips/menus/popups.

**You get for free:** transport, triggers, all GMCP parsing and game state
(objects, team, combat, map), the plugin system, the shared settings/sync
engines, and the real map renderer (mount `@web/embed`'s `EmbeddedMap` into a
`#map` element and feed it `@web/mapDataLoader`).

## Why this shape

- **Ports over imports** keeps the dependency arrow pointing one way and lets
  the client run headless (tests, an alt UI, a future non-web host).
- **Accessors over storage keys** let the physical storage move (it already did:
  the monolithic `uiSettings` blob was split into synced slices) without
  touching a single consumer.
- **One event bus** means a new UI reacts to the same stream the stock UI does —
  no reimplementation, no parallel state.

## Key files

- Ports: `src/client/ports/{uiPort,pluginHostPort,index}.ts`
- Boundary rule: `eslint.config.js`
- Settings accessors: `src/modules/core/settings/`
- Slice types/defaults: `src/shared/uiSettingsTypes.ts`, `src/shared/settingsDefaults.ts`
- Event definitions: `src/shared/events/`
- Client core: `src/client/Client.ts`, `src/client/main.ts` (`registerScripts`)
- Width feed: `src/web/contentWidthMeasurer.ts`
- Map embedding: `src/web/embed.ts`, `src/web/mapDataLoader.ts`
- Reference UI on the seam: `alt-ui/`

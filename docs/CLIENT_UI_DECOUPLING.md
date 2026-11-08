# Client ↔ UI Decoupling

The game client (`src/client`) is UI-agnostic. It knows how to talk to Arkadia
— transport, telnet/GMCP, triggers, ANSI rendering, combat/team/object state,
plugins — but it knows **nothing** about React, the DOM, or the stock web app.
A UI is something you plug *around* the client, not something the client depends
on. This is what makes it possible to build a second UI that drives the real
client with none of the stock chrome.

> `forge-ui/`, the second UI this document was written against, has been removed:
> its look lives on as the stock UI's Kuźnia theme. The references to it below
> describe the seam as it was exercised; the seam itself is unchanged.

This document explains the seam and how to build a UI on top of it.

## The layers

```
        ┌─────────────────────────────────────────────┐
        │  UI  (src/web, forge-ui, or your own)          │
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
| **Injected ports** (`@client/ports`) | UI → client (impl), client → UI (call) | Transient UI the client requests (tooltips, context menus, plugin popups) and the page itself (key presses, unload, clipboard, files, notifications). |
| **Event bus** (`@modules/core/eventBus`) | client → UI | Everything the UI reacts to: game output, GMCP state, connection status. |
| **Settings accessors** (`@modules/core/settings`) | both | Concern-scoped read/write of preferences. |
| **Direct method calls** (`Client` instance) | UI → client | Sending commands, pushing content width, connecting. |

Nothing else crosses the line. In particular, the client never reaches for
`document`, `window`, `navigator` or `location`, and never imports `@web`.

## The enforced boundary

The layers, bottom to top, are `@shared` ← `@modules` ← `@client` ← `@web` /
`@web-ui`. A layer imports only those below it at runtime. These are ESLint
rules (`eslint.config.js`, the `noUpwardImports` helper), not conventions, and
they cover `import()` as well as static imports:

| Layer | May not import at runtime |
|---|---|
| `src/shared` | `@modules`, `@client`, `@web`, `@web-ui` |
| `src/modules` | `@client`, `@web`, `@web-ui` |
| `src/client` | `@web`, `@web-ui` — and the globals `document`, `window`, `navigator`, `location` (`no-restricted-globals`) |

The client's one sanctioned DOM use is `src/client/ansi/renderSegments.ts`, the
renderer behind `AnsiAwareBuffer.toDom()`: it builds nodes only when a UI asks
it to render a line. DOM nodes a UI hands the client (an `onRender` container, a
plugin's element) are fine to work on; reaching for the page is not.

Sync v1 (`firebaseUnifiedSync`, `syncEngine`, `firebaseSyncListener`) still
`import()`s the backup categories from `@web/options/export`; those three files
are a listed exception until v1 is removed (stage 5b of `docs/dev/SYNC_V2_PLAN.md`).

Type-only imports are still permitted (they erase at build time). A few UI types
are still referenced this way from `src/client` and are tracked as follow-up
cleanups — relocating them to `@shared` would make the boundary type-clean too:

- `PluginApi/macros.ts` — `MobileButtonSetting`
- `ports/pluginHostPort.ts` — `PluginPopupConfig`

## The ports

Ports invert the dependency: the client declares an interface and calls a
getter; the UI injects an implementation once at bootstrap (the stock one in
`src/web/installClientPorts.ts`). The default is a **no-op**, so the client runs
headless (a UI with no tooltips just doesn't set them).

### `UiPort` — transient UI (`src/client/ports/uiPort.ts`)

```ts
interface UiPort {
  showHerbTooltip(herbId, actions, x, y): void;
  hideHerbTooltip(): void;
  showBookTooltip(categories, x, y): void;
  hideBookTooltip(): void;
  showContextMenu(items, x, y, options?): void;
  showHerbMenu?(herbId, actions, x, y, commandPrefix): void;  // herb named in the output
  showRoomMenu?(roomId, x, y): void;                          // room named in the output
  attachTooltip?(element, card): TooltipHandle;  // plugin api.ui.setTooltip; omit = no tooltip
  shouldSuppressKeys?(): boolean;                // e.g. a modal is open
}
setUiPort(port);   // UI installs its implementation
getUiPort();       // client core reads it (no-op until set)
```

`ContextMenuEntry.label` is deliberately `string | Node` — no React types — so
the client can build menu entries without depending on the web UI. A UI widens
this to its own richer entry type when it renders.

### `HostPort` — the page (`src/client/ports/hostPort.ts`)

Everything the client needs from the browser page, so that it never touches
`window`/`document`/`navigator`/`location` itself:

```ts
interface HostPort {
  platform: { isMac; isMobile; isIOS };
  onKeyDown(listener): unsubscribe;      // global keybinds; events need key/code/modifiers/repeat/preventDefault
  isTypingInTextField(): boolean;        // focus in a text field other than the command line
  onUnload(listener): unsubscribe;       // flush unsaved state
  onUserGesture(listener): unsubscribe;  // unlocks audio
  onStorageChange(key, listener): unsubscribe;  // another tab wrote localStorage[key]
  copyText(text); saveFile(name, content, mime); openTextFile(accept);
  loadScript(url) / removeScript(handle);       // legacy (non-module) plugins
  getLaunchParam(name) / clearLaunchParam(name);
  enableNotifications(); notify(message);
}
setHostPort(port);   // UI installs it
getHostPort();       // client reads it (inert until set)
```

The browser implementation is `src/web/browserHost.ts`. The unit-test setup
installs it too, so tests drive the client with real jsdom events. The inert
default delivers no keys and offers no files, which is what a headless client
wants.

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
| `*RenderSettings` | `RenderSettings` | font family, `xtermPalette`, `outputBackground`, timestamps, command echo, sounds |
| `*MapSettings` | `MapSettings` | room size/shape, marker, colours, pathfinding |
| `*ShellSettings` | `ShellSettings` | `wakeLock`, `fightTitleIcon`, haptics |
| `*BehaviorSettings` | `BehaviorSettings` | exploration/instant move, team numbering, object menu commands |
| `*DeviceViewSettings` | `DeviceViewSettings` | `contentFontSize`, `mapScale`, `outputMaxElements` |

Each accessor `get()` default-merges its slice; `set(patch)` writes only its own
slice; `onChange(cb)` fires on slice changes. The Render/Map/Shell/Behavior slice
keys are **shared** and sync across devices via the Firebase category registry;
see `SYNCHRONIZACJA.md`.

`DeviceViewSettings` is the exception: font size, map zoom, and output-buffer size
are physically stored in the **device-scoped** `uiSettings` blob (they are part of
`ChromeSettings`), so they stay tuned per physical device rather than syncing —
a small desktop font and a large phone font don't fight each other. Stock-only
chrome (buttons, footer, layout, split view, bar order, …) also lives in the
`uiSettings` blob and is ignored by forge UIs.

### Shell requirements are overrides, not writes

The layout manager (`layoutManagerState`) is one persisted key that *is* shared
between UIs. A shell whose chrome only works one way — forge is the dock grid,
so it needs `enabled`, the `objectList` slot and `spanningDocks: 'leftRight'` —
must not persist that: writing it would flip the stock UI's "Menedzer Okien" on
just because forge was opened once. Declare it process-locally instead, before
the first `LayoutProvider` mount:

```ts
import { setLayoutOverrides } from '@web/layout/utils/layoutStorage';
setLayoutOverrides({ enabled: true, enabledPanels: { objectList: true }, spanningDocks: 'leftRight' });
```

`loadLayoutState()` then reports the forced fields as set for this page, while
`saveLayoutState()` writes the user's own persisted values back for exactly
those fields — everything else (dock trees, extents, popup state) persists
normally. `loadPersistedLayoutState()` returns the unoverridden state and is
what settings export / device sync use. `isLayoutModeForced()` lets a settings
panel hide toggles that would be inert (see `GeneralTab.tsx`). Capability flags
`setDockingSupported()` / `setRailSpanSupported()` work the same way: process-
local, never persisted.

## Building a UI

A UI is an HTML entry + a bootstrap module. The minimal recipe (see the React
`forge-ui/` app — `main.tsx` + `client/bootstrap.ts` — for a full example):

```ts
import mudClient from '@web/MudClient';        // transport (WebSocket/telnet-proxy)
import Client from '@client/Client';
import { registerScripts } from '@client/main';
import { setHostPort, setUiPort } from '@client/ports';
import { createBrowserHost } from '@web/browserHost';
import { installContentWidthMeasurer } from '@web/contentWidthMeasurer';
import eventBus from '@modules/core/eventBus';

// 1. Inject the port(s). No-op is fine if you don't render tooltips/menus.
//    Without a host, no key reaches the client's keybinds.
setHostPort(createBrowserHost());   // from '@web/browserHost'
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
engines, the real map renderer (mount `@web/embed`'s `EmbeddedMap` into a
`#map` element and feed it `@web/mapDataLoader`), and the command-line engine
below.

### Command-line input (`@web/commandInput`)

The command line is more than "read a value, call `sendCommand`": it carries
history (Mudlet-style ring, prefix auto-complete, Tab completion from history and the output
buffer), multiline submit-splitting (one `sendCommand` per `\n`), and password
mode. That logic is UI-crosscutting, so it lives in a **headless engine** that
every UI drives — the client core never sees it (it's UI concern, hosted in
`@web`, not `@client`).

```ts
import { CommandLineEngine } from '@web/commandInput/CommandLineEngine';
import { domEditableField } from '@web/commandInput/editableField';
import { localStorageHistoryStore } from '@web/commandInput/commandHistoryStore';
import { harvestOutputWords } from '@web/commandInput/outputWords';

const engine = new CommandLineEngine({
  field: domEditableField(inputEl),            // any <input>/<textarea> (a React ref works)
  passwordField: domEditableField(passwordEl), // masked field for echo-off
  sendCommand: client.sendCommand.bind(client),
  isPasswordMode: () => mudClient.isPasswordMode(),
  getCommandLineSuggestions: () => client.commandLineSuggestions ?? [],
  getOutputWords: () => harvestOutputWords(outputEl),
  getClearInputOnSend: () => getRenderSettings().clearInputOnSend,
  store: localStorageHistoryStore(),           // shared 'commandHistory' key → one history per profile
});
// translate your key/pointer events into engine.submit()/historyMove()/handleTabCompletion()/…
```

The engine owns no DOM and no listeners — a UI injects an `EditableField` (a
native input/textarea already satisfies it; tests pass a fake) and a
`CommandHistoryStore`, then routes its own events in. The stock web adapter is
`CommandInputController`; the forge-ui React adapter is
`forge-ui/hooks/useCommandLine.ts`. **Password mode is already decoupled**: the
client pushes it as the `telnet.echo` bus event (server echo off ⇒ password), so
a UI just subscribes and swaps to its masked field — no new port needed.

## Why this shape

- **Ports over imports** keeps the dependency arrow pointing one way and lets
  the client run headless (tests, an forge UI, a future non-web host).
- **Accessors over storage keys** let the physical storage move (it already did:
  the monolithic `uiSettings` blob was split into synced slices) without
  touching a single consumer.
- **One event bus** means a new UI reacts to the same stream the stock UI does —
  no reimplementation, no parallel state.

## Key files

- Ports: `src/client/ports/{uiPort,pluginHostPort,hostPort,index}.ts`; stock implementations `src/web/installClientPorts.ts`, `src/web/browserHost.ts`
- Boundary rules: `eslint.config.js`
- Settings accessors: `src/modules/core/settings/`
- Slice types/defaults: `src/shared/uiSettingsTypes.ts`, `src/shared/settingsDefaults.ts`
- Event definitions: `src/shared/events/`
- Client core: `src/client/Client.ts`, `src/client/main.ts` (`registerScripts`)
- Width feed: `src/web/contentWidthMeasurer.ts`
- Map embedding: `src/web/embed.ts`, `src/web/mapDataLoader.ts`
- Command-line engine: `src/web/commandInput/{CommandLineEngine,editableField,commandHistoryStore,outputWords}.ts`; adapters `src/web/commandInput/CommandInputController.ts`, `forge-ui/hooks/useCommandLine.ts`
- Password/echo signal: `src/shared/socket/echo.ts` → `telnet.echo` event
- Reference UI on the seam: `forge-ui/`

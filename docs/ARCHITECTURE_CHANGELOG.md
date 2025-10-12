# Architecture Implementation Log

This document captures progress toward the next-generation runtime described in `docs/ARCHITECTURE.md`. It records completed work and highlights upcoming steps so contributors can quickly understand the migration status.

## Completed work

### Event hub foundation
- Added a typed `EventHub` utility that wraps `EventTarget` to provide strongly typed subscriptions and emissions for runtime modules, and established a compatibility bridge that keeps the legacy `eventBus` in sync while the migration proceeds. (see `client/src/runtime/event-hub.ts`, `client/test/runtime/message-router.test.ts`).

### Settings service modernization
- Introduced a `SettingsService` interface and shared `settingsEventHub` so settings updates can be broadcast through the new event system.
- Implemented `LocalStorageSettingsService`, which normalizes stored data, exposes a behavior-subject-like observable, forwards updates to the event hub, and handles errors consistently. Tests exercise per-character scoping and hub notifications, while the legacy `Client` consumes the unified stream instead of talking to storage directly. (see `client/src/runtime/settings/settings-service.ts`, `client/src/runtime/settings/local-storage-service.ts`, `client/test/runtime/settings-service.test.ts`, `client/src/Client.ts`).

### Service registry bootstrap
- Added a lightweight `ServiceRegistry` singleton that wires the `LocalStorageSettingsService` and seeds a shared `DefaultDataCatalog` configured with the core loaders. This establishes the pattern for hosting runtime services (data catalog, transport adapters, etc.) under a unified lifecycle manager. (see `client/src/runtime/service-registry.ts`).

### Transport message routing revamp
- Refactored the message router to depend on typed transport adapters, merge buffered GMCP messages, and forward structured events through the legacy bus while emitting typed runtime events. Jest coverage asserts GMCP forwarding, message sanitisation, and compatibility bridge behaviour. (see `client/src/runtime/transport/message-router.ts`, `client/src/runtime/transport/types.ts`, `client/test/runtime/message-router.test.ts`).

### Core data catalog with remote loaders
- Implemented a typed data catalog and registered default loaders for maps, NPCs, and color definitions that fetch authoritative JSON snapshots over HTTPS before persisting to IndexedDB/localStorage via pluggable adapters. Runtime tests cover readiness events, caching behaviour, and loader overrides. (see `client/src/runtime/data/default-catalog.ts`, `client/src/runtime/data/core-loaders.ts`, `client/src/runtime/data/persistence`, `client/test/runtime/data/catalog.test.ts`).
- The web client now surfaces catalog status in the bootstrap progress UI by inspecting dataset metadata, ensuring users understand when map and colour data are ready. (see `web-client/src/main.ts`).

### WebSocket transport adapter
- Added a production-ready `WebSocketTransportAdapter` that encapsulates Arkadia-specific protocol details such as GMCP framing, MCCP decompression, periodic pings, and exponential backoff reconnect logic. Unit tests simulate socket lifecycles to confirm reconnection, encoding, and ping behaviour. (see `client/src/runtime/transport/websocket-adapter.ts`, `client/test/runtime/transport/websocket-adapter.test.ts`).

### Mock transport adapter and test subject
- Implemented a `MockTransportAdapter` plus a minimal `TransportSubject` so runtime components can be exercised without a real socket. The message-router tests rely on this adapter to simulate GMCP frames and lifecycle events deterministically. (see `client/src/runtime/transport/mock-adapter.ts`, `client/src/runtime/transport/subject.ts`, `client/test/runtime/message-router.test.ts`).

### Shared UI store integration
- Introduced a Zustand-based `uiStore` that subscribes to the runtime event hub and the modernised settings service, projecting GMCP updates and preference changes into a single UI state tree. The store can also bind to legacy DOM events so existing widgets continue to work during the transition. (see `web-client/src/ui/store.ts`).
- Updated HUD behaviour to consume the shared store; for example, the fight title widget reacts to store state and preferences in tests, proving the end-to-end flow from store updates to DOM side effects. (see `web-client/test/FightTitle.test.ts`).

### Team manager event hub adoption
- Migrated `TeamManager` to subscribe directly to the typed runtime event hub for GMCP updates, eliminating its dependency on the legacy `eventBus` bridge and exercising the new hub in live gameplay flows such as target tracking and queue maintenance. (see `client/src/TeamManager.ts`).

### Unified command dispatcher for UI intents
- Introduced a `CommandDispatcher` abstraction with a `ClientCommandDispatcher` wrapper so UI surfaces can send text commands, custom events, and extension messages through a single runtime gateway. (see `client/src/runtime/command-dispatcher.ts`).
- Updated the shared `uiStore` to require an injected dispatcher, and extended intent handling so React panels and legacy widgets dispatch through the same API. Jest verifies both the happy path and misconfiguration errors to ensure UI flows fail fast. (see `web-client/src/ui/store.ts`, `web-client/test/uiStore.test.ts`).

### Data catalog consumption in the UI
- Enhanced the `uiStore` to mirror catalog datasets, track load metadata, and expose `loadDataset` / `ensureDataset` helpers that deduplicate network work while keeping subscribers informed of status changes. (see `web-client/src/ui/store.ts`).
- Refactored the map bootstrapper and NPC options panel to consume those helpers, surface progress feedback, and persist user edits back into the catalog cache so runtime and UI share a single source of truth. (see `web-client/src/main.ts`, `web-client/src/options/Npc.tsx`).

### Combat-aware HUD state in the shared UI store
- Extended the shared `uiStore` to normalise GMCP object updates, derive a combat-aware nearby object list, and expose computed `teamStatus` selectors so widgets can react without duplicating parsing logic. (see `web-client/src/ui/store.ts`).
- Updated the classic `AttackMode` HUD widget to subscribe to the store and automatically toggle its visibility based on the derived leader flag rather than bespoke event wiring. (see `web-client/src/AttackMode.ts`).
- Migrated mobile direction buttons and their React configuration panel to the same selectors, letting them adapt layouts and persistence flows to solo/team/leader contexts while relying on browser-managed teardown instead of manual unload listeners. (see `web-client/src/scripts/mobileDirectionButtons.ts`, `web-client/src/options/MobileButtons.tsx`).

### Object list migration to the shared UI store
- Rebuilt the legacy object list controller so it binds directly to `uiStore` selectors for nearby objects and the attack queue, reuses the centralised command dispatcher, and keeps the DOM in sync across both the main HUD and the Picture-in-Picture surface. (see `web-client/src/ObjectList.ts`).
- Extended the shared `uiStore` to surface the attack queue emitted by the legacy client bridge and expose a `selectAttackQueue` helper, allowing classic widgets to follow the unified state shape without bespoke events. (see `web-client/src/ui/store.ts`).

### Client extension global removal
- Removed the `window.clientExtension` bootstrap assignment and replaced it with a `clientBindings` slice in the shared `uiStore`, exposing the runtime `Client`, helpers (map, triggers, output handler), and notification utilities through dependency injection. (see `web-client/src/main.ts`, `web-client/src/ui/store.ts`).
- Updated HUD helpers, modals, debug tooling, sandbox utilities, and trigger inspectors to resolve services via the store or the `CommandDispatcher`, eliminating direct global lookups. (see `web-client/src/debug.ts`, `web-client/src/embed.ts`, `web-client/src/options/Shortcuts.tsx`, `web-client/src/sandbox.ts`, `web-client/src/triggerFinder.ts`, `web-client/src/triggerTester.ts`).
- Documented migration guidance for third-party scripts that previously depended on the global, highlighting the new `uiStore` selectors and dispatcher entry points for commands, events, and runtime helpers. (see `docs/ARCHITECTURE.md`).

## Planned next steps
- Continue migrating remaining runtime modules from the legacy `eventBus` to direct `EventHub` subscriptions so the bridge shim can eventually be removed.
- Expose the shared data catalog to feature modules and UI consumers, retiring bespoke loaders such as `mapDataLoader` and `npcDataLoader`.
- Migrate additional UI widgets and React panels to the shared `uiStore`, removing direct DOM manipulation and `window.clientExtension` dependencies.
- Update runtime bootstrap code to construct transports, routers, and services through the new registry so we can phase out ad-hoc wiring in `web-client/src/main.ts` and `client/src/main.ts`.

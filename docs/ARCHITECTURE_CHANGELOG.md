# Architecture Implementation Log

This document captures progress toward the next-generation runtime described in `docs/ARCHITECTURE.md`. It records completed work and highlights upcoming steps so contributors can quickly understand the migration status.

## Completed work

### Event hub foundation
- Added a typed `EventHub` utility that wraps `EventTarget` to provide strongly typed subscriptions and emissions for runtime modules. This is the backbone for the shared event system referenced in the architecture proposal. (see `client/src/runtime/event-hub.ts`).

### Settings service modernization
- Introduced a `SettingsService` interface and shared `settingsEventHub` so settings updates can be broadcast through the new event system.
- Implemented `LocalStorageSettingsService`, which normalizes stored data, exposes a behavior-subject-like observable, forwards updates to the event hub, and handles errors consistently. This service becomes the single source of truth for configuration and removes reliance on scattered storage utilities. (see `client/src/runtime/settings/settings-service.ts`, `client/src/runtime/settings/local-storage-service.ts`).

### Service registry bootstrap
- Added a lightweight `ServiceRegistry` singleton that wires the `LocalStorageSettingsService` and seeds a shared `DataCatalog`. This establishes the pattern for hosting runtime services (data catalog, transport adapters, etc.) under a unified lifecycle manager. (see `client/src/runtime/service-registry.ts`).

### Transport message routing revamp
- Refactored the message router to depend on typed transport adapters, merge buffered GMCP messages, and forward structured events through the legacy bus. This sets the stage for routing runtime events into the new architecture without `window` globals. (see `client/src/runtime/transport/message-router.ts` and `client/src/runtime/transport/types.ts`).

### Core data catalog with remote loaders
- Implemented a typed data catalog and registered default loaders for maps, NPCs, and color definitions that fetch authoritative JSON snapshots over HTTPS before persisting to IndexedDB/localStorage. These loaders can be overridden in tests, giving the runtime a unified way to hydrate shared datasets. (see `client/src/runtime/data/core-loaders.ts`).

### WebSocket transport adapter
- Added a production-ready `WebSocketTransportAdapter` that encapsulates Arkadia-specific protocol details such as GMCP framing, MCCP decompression, periodic pings, and exponential backoff reconnect logic. This adapter implements the typed transport contract so it can be swapped or mocked without touching runtime modules. (see `client/src/runtime/transport/websocket-adapter.ts`).

### Shared UI store integration
- Introduced a Zustand-based `uiStore` that subscribes to the runtime event hub and the modernised settings service, projecting GMCP updates and preference changes into a single UI state tree. Integration tests assert that HUD widgets and React panels observe the same store, demonstrating the end-to-end flow from runtime events to UI reactions. (see `web-client/src/ui/store.ts`, `web-client/test/uiStore.integration.test.tsx`).

## Planned next steps
- Replace legacy `eventBus` listeners in runtime modules with direct `EventHub` subscriptions so the bridge shim can be removed.
- Expose the shared data catalog to feature modules and UI consumers, retiring bespoke loaders such as `mapDataLoader` and `npcDataLoader`.
- Migrate additional UI widgets and React panels to the shared `uiStore`, removing direct DOM manipulation and `window.clientExtension` dependencies.
- Provide a lightweight mock transport adapter so integration tests can exercise the runtime without opening real WebSocket connections.

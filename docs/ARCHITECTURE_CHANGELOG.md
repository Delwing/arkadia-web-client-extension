# Architecture Implementation Log

This document captures progress toward the next-generation runtime described in `docs/ARCHITECTURE.md`. It records completed work and highlights upcoming steps so contributors can quickly understand the migration status.

## Completed work

### Event hub foundation
- Added a typed `EventHub` utility that wraps `EventTarget` to provide strongly typed subscriptions and emissions for runtime modules. This is the backbone for the shared event system referenced in the architecture proposal. (see `client/src/runtime/event-hub.ts`).

### Settings service modernization
- Introduced a `SettingsService` interface and shared `settingsEventHub` so settings updates can be broadcast through the new event system.
- Implemented `LocalStorageSettingsService`, which normalizes stored data, exposes a behavior-subject-like observable, forwards updates to the event hub, and handles errors consistently. This service becomes the single source of truth for configuration and removes reliance on scattered storage utilities. (see `client/src/runtime/settings/settings-service.ts`, `client/src/runtime/settings/local-storage-service.ts`).

### Service registry bootstrap
- Added a lightweight `ServiceRegistry` singleton that currently wires the `LocalStorageSettingsService`. This establishes the pattern for hosting future services (data catalog, transport adapters, etc.) under a unified lifecycle manager. (see `client/src/runtime/service-registry.ts`).

### Transport message routing revamp
- Refactored the message router to depend on typed transport adapters, merge buffered GMCP messages, and forward structured events through the legacy bus. This sets the stage for routing runtime events into the new architecture without `window` globals. (see `client/src/runtime/transport/message-router.ts` and `client/src/runtime/transport/types.ts`).

## Planned next steps
- Replace direct `eventBus` coupling in the message router with the new `EventHub` so UI and runtime consume the same streams.
- Introduce transport adapter implementations that satisfy the typed `TransportAdapter` contract (e.g., WebSocket, mock adapter for tests).
- Expand the service registry to include data catalog loaders and other runtime services described in the architecture proposal.
- Expose the settings observable to the React UI store, enabling a single reactive source of truth for configuration panels and HUD widgets.

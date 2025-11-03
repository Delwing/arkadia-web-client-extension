# Major Cross-Module Dependencies (`client` ⇄ `web-client`)

This document tracks the most significant coupling points between the legacy `client/` package (Chrome extension / background scripts) and `web-client/` (SPA + sandbox). Use it to prioritize de-coupling work during the merge effort.

---

## 1. Event Bus Contracts
- **Shared types**: `ClientEvents`, `SendCommandEvent`, `KnowledgeReportAction`, etc.
- **Problem**: Both codebases declare their own copies (`client/src/eventBus.ts`, `web-client/src/ArkadiaClient.ts`, `Recorder`, tests). Divergence introduces silent runtime mismatches.
- **Impact**: High — affects type safety, recorder playback, automation tests.
- **Action**: Consolidate into `src/shared/events/` (see Merge Plan Slice 1). Ensure both bundles consume a single source of truth.

## 2. Output Rendering & DOM Helpers
- **Shared logic**: context menu interactions, timestamp toggles, clickable text markers, sticky output clone logic.
- **Problem**: Historically duplicated between extension and SPA; `web-client` recently adopted the extension’s helpers.
- **Impact**: Medium to High — differences cause inconsistent UX (e.g., context menu placement, command history).
- **Action**: Keep `src/shared/dom/contextMenu.ts` and `src/shared/dom/outputMessageHandler.ts` aligned; migrate remaining helpers into `src/shared/ui/`. Remove residual references to `window.clientExtension` in favor of shared registries.

## 3. Recorder & Playback
- **Shared artifacts**: `Recorder` class, `ArkadiaClient` recorder hooks, sandbox/test harnesses.
- **Problem**: The `client` module uses the same recorder semantics via `MakeStringClickable` and `context menu` operations. Divergent hook signatures complicate shared playback features.
- **Impact**: High — regression risk for recording/auto-record features across platforms.
- **Action**: Relocate recorder logic to `src/shared/recorder/` with platform adapters. Ensure tests mock the shared entry points.

## 4. Map & Location Services
- **Shared pieces**: `MapHelper`, location restoration logic, map data loaders (`loadMapData`, `loadColors`), Playwright location-restoration e2e suite.
- **Problem**: `web-client` and `client` both rely on `MapHelper` to translate GMCP data into UI state. Differences in initialization cause inconsistent state restoration.
- **Impact**: High — broken map or wrong location affects gameplay drastically.
- **Action**: Extract map utilities into a shared module; keep Mudlet-specific renderer adapters isolated. Tests should run against the shared helper.

## 5. Socket & GMCP Plumbing
- **Shared behavior**: `web-client/src/ArkadiaClient.ts` WebSocket setup, recorder hooks, push/pull of GMCP messages, command emission outbound.
- **Problem**: Extension background scripts also own socket logic; `web-client` reimplemented subsets. Code drift leads to subtle GMCP differences.
- **Impact**: High — network protocol mismatches break command/GMCP flows.
- **Action**: Design `src/shared/socket/` to host handshakes, telnet/GMCP parsing, and recorder hookups. Consumers inject platform-specific transport (browser WebSocket vs extension port).

## 6. Client Registry & Global Access
- **Shared state**: `clientRegistry` ensures both environments access the active `Client` instance via `globalThis.clientExtension`.
- **Problem**: Historically sprinkled `window.clientExtension` references across code/tests. Needs centralization to avoid divergences.
- **Impact**: Medium — broken registry prevents SPA/extension from issuing commands or accessing maps.
- **Action**: Maintain the registry as the only mutation point. Update tests/e2e scripts to rely on helper instead of ad-hoc globals.

## 7. Herb Manager & Context Menus
- **Shared behavior**: Herb context menu building (`client/src/contextMenus.ts`), web UI integration, right-click actions.
- **Problem**: Tight coupling to `Client.OutputHandler` for context menus; multiple code paths trigger the same operations.
- **Impact**: Medium — inconsistent menu behavior or command emission.
- **Action**: Keep shared context-menu helpers decoupled from client internals; both modules import from the shared helper.

## 8. Test Harness & Mocks
- **Shared assets**: Jest mocks for `Client`, Playwright init scripts (`installMockWebSocket`), e2e helpers for GMCP.
- **Problem**: Duplicated mock behavior leads to drift (e.g., command logging, map readiness).
- **Impact**: Medium — failing tests or false positives hide regressions.
- **Action**: Standardize test helpers to import from shared mock utilities (future `src/shared/testing/`).

---

### Observations / Next Steps
- Items 1–5 form the critical path; address them early to unblock later slices (React migration, module flattening).
- Items 6–8 represent “glue” that must be maintained in tandem to avoid regressions during refactors.
- Update this document as dependencies are resolved or new coupling points are discovered.

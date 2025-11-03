# Merge Plan Assessment: Slices 4-6

**Assessment Date:** 2025-11-03
**Branch:** migration-slices

## Overview

This document contains the assessment of completion status for slices 4-6 of the web-client/client merge plan.

**Overall Status: 70-75% Complete**

The infrastructure is substantially in place with shared modules established, but UI component migration and some integration details remain incomplete.

---

## Slice 4: Client Registry Consolidation

**Status: ✅ 85% Complete**

### Objectives (from plan)
1. Promote `clientRegistry` into `src/shared/runtime/`
2. Ensure both entry points register through the same helper
3. Update Playwright/Jest helpers to reference `globalThis.clientExtension` via shared registry

### Completed Items

#### 1. Client Registry Infrastructure ✅ COMPLETE
- **Location:** `src/shared/runtime/clientRegistry.ts:1` (34 lines)
- **Implementation includes:**
  - `setClientInstance<T>(instance: T)` - registers to both local variable and `globalThis.clientExtension`
  - `getClientInstance<T>()` - retrieves from local cache or `globalThis.clientExtension`
  - `requireClientInstance<T>()` - throws if instance not found
  - `clearClientInstance()` - cleanup method
- Properly exported via `src/shared/runtime/index.ts:1`

#### 2. Client Instance Registration ✅ COMPLETE
- Both `client` and `web-client` properly register instances
- **File:** `web-client/src/main.ts:68` - `setClientInstance(client)` called after Client instantiation
- Client implementation at: `web-client/src/ArkadiaClient.ts:1` (extends `ClientAdapter`)
- Extension runtime uses same registry

#### 3. Jest/Test Helper Integration ✅ COMPLETE
- Test files properly use the registry:
  - `web-client/test/Recorder.test.ts:1` uses `setClientInstance()` and `clearClientInstance()`
- Jest setup files provide mock globals:
  - `client/jest.setup.ts:1`
  - `web-client/jest.setup.js:1`
- Tests properly clean up after themselves (afterEach hooks)

### Missing Items

1. **Documentation** - No comments/docs explaining the pattern or usage constraints
2. **Type Safety** - Could use generic constraint on ClientAdapter type to ensure type safety across bundles
3. **Lifecycle Management** - No documentation about when/how to clear the instance (though tests show afterEach pattern)

### Duplicated Code
**None identified** - Single source of truth maintained in `src/shared/runtime/clientRegistry.ts:1`

### File Locations
- `src/shared/runtime/clientRegistry.ts:1` (implementation)
- `src/shared/runtime/index.ts:1` (exports)
- `web-client/src/main.ts:68` (registration)
- `web-client/src/ArkadiaClient.ts:1` (client implementation)
- `web-client/test/Recorder.test.ts:1` (test usage)

### Completion Breakdown
- Core functionality: 100%
- Integration: 100%
- Testing: 100%
- Documentation: 10%

### Overall Completion: **85%**

---

## Slice 5: Map & Location Services

**Status: ⚠️ 75% Complete**

### Objectives (from plan)
1. Extract `MapHelper`, map loaders, and location-restoration logic into `src/shared/map/`
2. Introduce explicit interfaces for renderer interactions to keep Mudlet-specific calls isolated
3. Retire duplicate `loadMapData` / `loadColors` wiring by pointing both bundles at shared loader

### Completed Items

#### 1. MapHelper Consolidation ✅ COMPLETE
- **Location:** `src/shared/map/MapHelper.ts:1` (432 lines)
- **Fully implemented with:**
  - Room navigation logic
  - Location history tracking
  - Map state persistence
  - GMCP event handling
  - Special exit resolution
  - Team follow logic
  - Storage integration
- Both bundles use the same MapHelper class
- Exported via `src/shared/map/index.ts:1`

#### 2. Map Data Loader ✅ COMPLETE
- **Location:** `src/shared/map/dataLoader.ts:1` (111 lines)
- **Implements factory pattern:** `createMapDataLoader(provider: MapStoreProvider)`
- **Provides:**
  - `loadMapData(onProgress?)` with fallback to cached snapshot
  - `loadColors()` with fallback behavior
  - `subscribeToMapData()` for reactive updates
  - `subscribeToMapColors()` for color palette updates
  - `subscribeToMapDataProgress()` for progress tracking
- Proper separation of concerns (abstraction over storage provider)

#### 3. Web-Client Integration ✅ COMPLETE
- **Location:** `web-client/src/mapDataLoader.ts:1` (21 lines)
- Properly wraps shared loader with web-specific store providers:
  - `getMapDataStore()` from `web-client/src/dataStores/mapStore`
  - `getMapColorsStore()` from web-client store
- Clean adapter pattern - no duplication

#### 4. Location Restoration ✅ COMPLETE
- **web-client/src/main.ts:88-100:**
  - Reads `locationId` query parameter
  - Calls `client.Map.setMapRoomById(initialLocationId)`
  - Clears parameter from URL using `history.replaceState`
- **web-client/src/embed.ts:137-143:**
  - Restores map room from localStorage on initialization
  - Reads `mapperRoomId` and sets via MapHelper

#### 5. Direction Utilities ✅ COMPLETE
- **Location:** `src/shared/map/directions.ts:1`
- Implements direction normalization (long/short form conversion)
- Re-exported from `src/shared/map/index.ts:1`

#### 6. Renderer Interaction Isolation ⚠️ PARTIAL
- **web-client/src/embed.ts:1** (EmbeddedMap class) implements Mudlet-map-renderer isolation
- Uses explicit interfaces for renderer: MapReader, PathFinder, Renderer from `mudlet-map-renderer`
- Properly isolated: no dependencies on client-specific code in MapHelper
- **Note:** Client-side MapHelper instantiation in `client/src/Client.ts:1` creates MapHelper with Mudlet-like interface mock, but no actual map loading/rendering occurs in client (by design, but not documented)

### Missing Items

1. **Location Persistence Tests** - Limited test coverage for location restoration logic
2. **Cross-Bundle Storage Documentation** - MapHelper references `mapperRoomId` but storage implementation differs:
   - `client` uses Mudlet's storage (mocked in tests)
   - `web-client` uses localStorage
   - Works but could be more explicit about storage contract

### Duplicated Code

**Minimal Duplication Identified:**
- `web-client/src/embed.ts:14-140` contains location restoration logic
  - Not duplicated; rather implements a different pattern (IndexedDB for visited rooms vs localStorage for position)
  - Could be slightly cleaner but acceptable as-is
- No duplicated map loader logic - both bundles properly use shared `createMapDataLoader`

### File Locations
- `src/shared/map/MapHelper.ts:1` (core implementation)
- `src/shared/map/dataLoader.ts:1` (data loading)
- `src/shared/map/directions.ts:1` (utilities)
- `src/shared/map/index.ts:1` (exports)
- `web-client/src/mapDataLoader.ts:1` (web adapter)
- `web-client/src/main.ts:88-100` (location restoration)
- `web-client/src/embed.ts:1` (embedded map + renderer)

### Completion Breakdown
- Core MapHelper functionality: 100%
- Data loading: 100%
- Location restoration: 100%
- Renderer isolation: 95%
- Test coverage: 60%
- Documentation: 40%

### Overall Completion: **75%**

---

## Slice 6: Split Socket vs UI Responsibilities

**Status: ⚠️ 60% Complete**

### Objectives (from plan)
1. Create `src/shared/socket/` containing WebSocket handshake, recorder hooks, and GMCP plumbing
2. Move web UI components (`KnowledgeReport`, `HerbManager`, mobile controls) into `src/ui/web/`
3. Leave generic DOM helpers in `src/shared/ui/`
4. Update imports so extension runtime reuses socket helpers, while SPA reuses UI modules

### Completed Items

#### 1. Socket/GMCP Plumbing ✅ COMPLETE
- **Location:** `src/shared/socket/`
- **Implementation:**
  - `src/shared/socket/constants.ts:1` - Telnet/GMCP protocol constants (6 lines)
  - `src/shared/socket/gmcp.ts:1` (93 lines) - GMCP stream parsing and encoding:
    - `createTelnetOptionParser()` - Handles telnet subnegotiation
    - `stripTelnetSequences()` - Removes telnet control sequences
    - `encodeGmcp()` - Encodes GMCP messages
    - `createGmcpStream()` - Main GMCP processor with callbacks
- Properly abstracted for reuse by both bundles

#### 2. WebSocket Handshake & Connection ✅ COMPLETE
- **Location:** `web-client/src/ArkadiaClient.ts:95-131`
- **Implements:**
  - WebSocket connection management
  - Message encoding/decoding (base64)
  - GMCP stream integration
  - Telnet option parsing
  - First GMCP event detection and auto-recording trigger
  - Clean connection/disconnect lifecycle
- Proper use of shared socket utilities

#### 3. Recorder Hooks & Integration ✅ COMPLETE
- **Location:** `src/shared/recorder/Recorder.ts:1` (335 lines)
- Abstract recorder with hooks interface:
  - `processIncomingData(data, options)` - for incoming stream
  - `sendCommand(command, echo, options)` - for outgoing commands
  - `emit(event, ...args)` - for events
  - `getCurrentMapLocation()` - optional, for location tracking
  - `setMapLocationSilently(locationId)` - optional, for playback
- **Web-client wrapper:** `web-client/src/Recorder.ts:1` (27 lines)
  - Extends base with `notifySendCommand` event emission
  - Uses IndexedDB storage via `recordingStorage.ts`

#### 4. Recording Storage Backend ✅ COMPLETE
- **Location:** `web-client/src/recordingStorage.ts:1` (63 lines)
- IndexedDB implementation with:
  - `saveRecording(id, events)`
  - `getRecording(id)`
  - `getRecordingNames()`
  - `deleteRecording(id)`
- Auto-recording triggered on first GMCP char.info event
- Proper error handling and transaction management

#### 5. Generic DOM Helpers ✅ COMPLETE
- **Location:** `src/shared/dom/`
- **Implementation:**
  - `contextMenu.ts:1` (50+ lines) - Generic context menu renderer
  - `outputMessageHandler.ts:1` (150 lines) - Generic message handler with:
    - Timestamp formatting and display
    - Message batching/grouping
    - Sticky area management
    - DOM element lifecycle
- Both web-independent; accept client interface as parameter

### Missing Items

#### 1. UI Organization Structure ❌ NOT CREATED (Major Gap)

**Expected structure NOT created:**
```
src/ui/
├── web/
│   ├── components/
│   │   ├── KnowledgeReport.tsx
│   │   ├── HerbManager.tsx
│   │   └── ...
│   └── mobile/
│       ├── mobileDirectionButtons.ts
│       └── mobileCommandRadial.ts
└── shared/
    └── (generic UI helpers)
```

**Current state:** UI components remain in `web-client/src` (not moved to shared/ui structure)

**Components that should be moved:**
- `web-client/src/knowledge/KnowledgeReport.tsx` → `src/ui/web/components/KnowledgeReport.tsx`
- `web-client/src/herbs/HerbManager.tsx` → `src/ui/web/components/HerbManager.tsx`
- `web-client/src/scripts/mobileDirectionButtons.ts` → `src/ui/web/mobile/mobileDirectionButtons.ts`
- `web-client/src/scripts/mobileCommandRadial.ts` → `src/ui/web/mobile/mobileCommandRadial.ts`
- `web-client/src/mobileButtonSettings.ts` → `src/ui/web/mobile/mobileButtonSettings.ts`

#### 2. Socket vs UI Responsibility Separation ⚠️ 60% INCOMPLETE

**Current state:** `web-client/src/ArkadiaClient.ts:1` mixes concerns:
- Socket connection management ✅
- WebSocket handling ✅
- But also handles recorder hookup and event emission - could be clearer

**Could be improved:**
- Extract WebSocket transport to `src/shared/socket/websocket.ts`
- Move connection logic from `web-client/src/ArkadiaClient.ts`
- Keep ArkadiaClient as adapter/wrapper only

#### 3. Generic UI Helpers Not in src/shared/ui ❌

- DOM helpers exist in `src/shared/dom/*` but not organized under `src/ui/shared` or `src/shared/ui`
- No clear namespace for shared vs web-specific UI components

### Duplicated Code

**No Socket Implementation Duplication:**
- Shared socket utilities properly reused
- Only web-client implements WebSocket (by design)

**No UI Component Duplication Yet:**
- Components still in web-client only
- Not yet duplicated, but also not shared architecture-wise

**Potential Duplication Risk:**
- If client extension gains UI in future, would have to decide between:
  - Moving shared UI helpers to `src/ui/shared/`
  - Creating `src/ui/extension/` for extension-specific UI

### File Locations
- `src/shared/socket/constants.ts:1` (telnet constants)
- `src/shared/socket/gmcp.ts:1` (GMCP parsing)
- `src/shared/recorder/Recorder.ts:1` (recorder base)
- `src/shared/dom/contextMenu.ts:1` (context menus)
- `src/shared/dom/outputMessageHandler.ts:1` (message handling)
- `web-client/src/ArkadiaClient.ts:1` (client with socket)
- `web-client/src/Recorder.ts:1` (recorder adapter)
- `web-client/src/recordingStorage.ts:1` (storage backend)

### Components Still in web-client/src
- `web-client/src/knowledge/KnowledgeReport.tsx:1`
- `web-client/src/herbs/HerbManager.tsx:1`
- `web-client/src/scripts/mobileDirectionButtons.ts:1`
- `web-client/src/scripts/mobileCommandRadial.ts:1`
- `web-client/src/mobileButtonSettings.ts:1`

### Completion Breakdown
- Socket handshake/connection: 100%
- GMCP plumbing: 100%
- Recorder hooks: 100%
- Generic DOM helpers: 100%
- Socket/UI separation architecture: 30%
- UI component extraction: 0%
- Mobile UI organization: 40%

### Overall Completion: **60%**

---

## Cross-Slice Testing Coverage

### Slice 4 Tests
- ✅ `web-client/test/Recorder.test.ts:1` - Tests registry usage with clientExtension
- ✅ `client/test/Client.test.ts:1` - Mocks MapHelper properly
- ✅ Both bundles have Jest setups with proper mocks

### Slice 5 Tests
- ✅ `web-client/test/mapDataLoader.test.ts:1` - Tests map data loading
- ✅ `client/test/mapHelperIdz.test.ts:1` - Tests idz (find direction back) logic
- ⚠️ Limited location restoration tests

### Slice 6 Tests
- ✅ `web-client/test/Recorder.test.ts:1` - Tests playback and speed control
- ⚠️ Limited socket/GMCP parsing tests
- ⚠️ No comprehensive integration tests for full socket lifecycle

---

## Summary Table

| Slice | Component | Status | Completion | Critical Issues |
|-------|-----------|--------|------------|-----------------|
| 4 | Client Registry | ✅ Mostly Complete | 85% | Missing documentation |
| 5 | MapHelper | ✅ Mostly Complete | 85% | Minor test gaps |
| 5 | Map Loader | ✅ Complete | 100% | None |
| 5 | Location Restore | ✅ Complete | 100% | None |
| 6 | Socket/GMCP | ✅ Complete | 100% | None |
| 6 | Recorder | ✅ Complete | 100% | None |
| 6 | DOM Helpers | ✅ Complete | 100% | None |
| 6 | UI Organization | ❌ Not Started | 0% | **Major: src/ui/web not created** |

**Overall Slices 4-6: 70-75% Complete**

---

## Remaining Work

### 🔴 High Priority (Blocking Slice 6 Completion)

#### 1. Create UI Layer Structure
```
src/ui/
├── web/
│   ├── components/
│   │   ├── KnowledgeReport.tsx (move from web-client/src/knowledge)
│   │   ├── HerbManager.tsx (move from web-client/src/herbs)
│   │   └── ...
│   └── mobile/
│       ├── mobileDirectionButtons.ts (move from web-client/src/scripts)
│       ├── mobileCommandRadial.ts (move from web-client/src/scripts)
│       └── mobileButtonSettings.ts (move from web-client/src)
└── shared/
    └── (consider moving src/shared/dom/* here or create new generic helpers)
```

**Action Items:**
- Create directory structure: `src/ui/web/components/`, `src/ui/web/mobile/`
- Move UI components from `web-client/src` to `src/ui/web`
- Update all imports across the codebase
- Update path aliases in tsconfig if needed
- Test that `yarn --cwd web-client build` succeeds

#### 2. Document Slice 6 Architecture
- Socket layer vs UI layer separation
- Where UI components belong (web vs shared)
- How to add new UI features

### 🟡 Medium Priority

1. **Add documentation comments to registry patterns** (Slice 4)
   - Document lifecycle management
   - Add type safety constraints
   - Explain usage patterns

2. **Expand test coverage for location restoration** (Slice 5)
   - Test query parameter restoration
   - Test localStorage restoration
   - Test edge cases

3. **Add integration tests for socket→recorder→playback flow** (Slice 6)
   - Full WebSocket lifecycle
   - GMCP parsing edge cases
   - Recording playback scenarios

4. **Extract Socket Transport Layer** (Optional but clean)
   - Create `src/shared/socket/websocket.ts` with WebSocket transport
   - Move connection logic from `web-client/src/ArkadiaClient.ts`
   - Keep ArkadiaClient as adapter/wrapper

### 🟢 Low Priority

1. Refactor mobile button settings into more modular structure
2. Create reusable mobile UI component library
3. Add performance metrics for map loading
4. Consider creating stories/examples for map loader usage

---

## Risk Assessment

- **Low Risk:** Slices 4-5 are stable; no integration issues expected
- **Medium Risk:** Slice 6 UI organization still TBD; could cause refactoring churn later
- **Mitigation:** Complete UI structure extraction before merging to main

---

## Recommendations

1. ✅ **Slice 4 & 5 are merge-ready** - Can be merged to main with minor documentation improvements
2. ⚠️ **Slice 6 needs structure completion** - Must create `src/ui/` directories before final merge
3. ⚠️ **Add integration tests** - Particularly for socket→map→recorder interactions
4. 📝 **Document client patterns** - Especially registry and adapter patterns for future developers

---

## Testing Commands

```bash
# Run web-client tests
yarn --cwd web-client test

# Run web-client build
yarn --cwd web-client build

# Run client tests
yarn --cwd client test

# Run client build
yarn --cwd client build
```

---

## Cross-Reference

This assessment corresponds to:
- Source document: `docs/refactor/web-client-client-merge-plan.md`
- Previous assessment: `docs/refactor/slices-1-3-assessment.md`
- Branch: `migration-slices`
- Last commit: d706593 "step 6 migration"

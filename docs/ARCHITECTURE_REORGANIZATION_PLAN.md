# Code & Architecture Reorganization Plan

**Status**: Planning Phase
**Created**: 2025-11-04
**Last Updated**: 2025-11-19 (Major React Migration Update)

---

## Executive Summary

This document outlines a comprehensive plan to reorganize the codebase architecture, **completing the React migration** and establishing clear separation of concerns. The plan now includes migrating the entire frontend to a single React application with strategic "islands" for performance-critical rendering.

### Current Issues
- **16+ legacy vanilla JS components** coexisting with React versions
  - 10 duplicate components (class-based vs React)
  - 6 additional vanilla components (ObjectList, Mobile UI, Title updaters, LetterComposer)
- **Hybrid architecture**: Vanilla JS mixed with React, no single source of truth for UI state
- Circular dependencies between `@client` ↔ `@web`
- Oversized entry point (`main.ts` at 1708 lines, growing)
- DataStores split across multiple directories
- Duplicate type definitions
- ANSI parsing split between `@web/ansiParser` and `@client/ansi/FormatState`
- No centralized state management

### Goals
- ✅ **Single React application** with unified state management
- ✅ **React Islands architecture** for Map rendering and Terminal output (performance-critical)
- ✅ Zero circular dependencies
- ✅ Single source of truth for all components and types
- ✅ Clear, documented dependency hierarchy
- ✅ Maintainable codebase with separation of concerns
- ✅ Remove ~1000+ lines of legacy vanilla JS code
- ✅ Reduce `main.ts` from 1708 lines to ~50-100 lines

---

## Current Architecture Analysis

### Directory Structure
```
src/
├── client/          # Game client logic, triggers, scripts (93+ scripts)
├── modules/         # Core shared modules (storage, eventBus, data stores)
├── shared/          # Platform-agnostic shared code
├── ui/              # React UI components (migrated)
│   └── web/         # Web-specific UI components
└── web/             # Web platform entry point and integration
```

### Dependency Flow Issues

**Current (Problematic)**:
```
@client ⟷ @web  (circular - BAD)
```

**Desired**:
```
@shared (platform-agnostic)
    ↓
@modules (core business logic)
    ↓
@client (game client logic)
    ↓
@web (web platform integration)
    ↓
@web-ui (React UI components)
```

### Key Problems Identified

#### 1. Component Duplication
10 components exist in both class-based and React versions:

| Legacy (src/web/) | React (src/ui/web/) |
|-------------------|---------------------|
| CombatTimer.ts | components/timers/CombatTimer.tsx |
| CoverTimer.ts | components/timers/CoverTimer.tsx |
| LampTimer.ts | components/timers/LampTimer.tsx |
| TransportTimer.ts | components/timers/TransportTimer.tsx |
| ZaskTimer.ts | components/timers/ZaskTimer.tsx |
| CharState.ts | components/panels/CharState.tsx |
| CharStateInfo.ts | components/panels/CharStateInfo.tsx |
| BreakItemWarning.ts | components/panels/BreakItemWarning.tsx |
| MultiBinds.ts | components/panels/MultiBinds.tsx |
| ReleaseGuard.ts | components/panels/ReleaseGuard.tsx |

**Impact**: Maintenance overhead, confusion, increased bundle size

#### 2. Circular Dependencies
```typescript
// Client imports from web (BAD)
src/client/Client.ts:28: import {parseAnsiPatterns} from "@web/ansiParser";
src/client/PackageHelper.ts:1: import { addLocalNpc } from "@web/dataStores/npcStore";
src/client/scripts/multibinds.ts:7: from "@web/dataStores/multibindStore";

// Web imports from client (OK, but creates circular with above)
src/web/ArkadiaClient.ts:4: import {ClientAdapter} from "@client/Client";
src/web/main.ts:4: import Client from "@client/Client";
```

#### 3. Duplicate Type Definitions
```
src/client/types/MapData.d.ts ≠ src/web/types/MapData.d.ts
src/modules/core/defaultSettings.ts AND src/web/options/defaultSettings.ts
```

#### 4. Split DataStores
```
src/modules/data/dataStores/ (5 stores)
src/web/dataStores/ (3 stores)
```

#### 5. Oversized Entry Point
- `src/web/main.ts`: 1708 lines (grown by 131 lines since plan creation)
- Mixes initialization, UI mounting, event handling, etc.

---

## Phase 0: Recent Architectural Changes (2025-11)

**Priority**: Documentation
**Status**: ✅ Completed
**Impact on Plan**: Medium - Affects Phase 2.1

### Changes Since Plan Creation

#### AnsiAwareBuffer Introduction

A significant architectural improvement has been implemented for line processing:

**New Component**: `src/client/ansi/FormatState.ts`
- Introduced `AnsiAwareBuffer` class for format-aware text buffering
- Handles ANSI formatting state preservation (colors, bold, italic, underline, hyperlinks, etc.)
- Replaces simple string buffers for line processing

**Updated Interfaces**:
```typescript
// src/client/Client.ts:32
export interface ClientAdapter {
    output(text?: string | AnsiAwareBuffer, type?: string): void
    // ... other methods
}

// src/client/Client.ts:96-98
inLineProcess = false; //TODO figure out something else
buffer: { out: AnsiAwareBuffer, type?: string }[] = [];
```

**Key Features**:
- Rich text formatting support (8 ANSI colors, 256 xterm colors, RGB colors)
- Text decoration support (bold, italic, underline, strikethrough, blink)
- Hyperlink support with event handlers
- Efficient segment-based storage
- State tracking and format preservation

#### ANSI Handling Split

The codebase now has two ANSI-related components with different purposes:

1. **`src/web/ansiParser.ts`** (112 lines)
   - Converts ANSI escape codes to HTML spans
   - Web-specific rendering logic
   - Used by `ArkadiaClient` for terminal output

2. **`src/client/ansi/FormatState.ts`** (600+ lines)
   - Platform-agnostic ANSI state tracking
   - `AnsiAwareBuffer` for format-aware buffering
   - Used throughout client for line processing

**Current Issue**: Creates circular dependency
- `src/web/ArkadiaClient.ts:1` imports from `@web/ansiParser`
- Client layer references should not depend on web layer

#### Line Processing Architecture

The `inLineProcess` flag (Client.ts:96) has a TODO comment:
```typescript
inLineProcess = false; //TODO figure out something else
```

This suggests the line processing mechanism is still being refined. The flag is used to track whether the client is currently processing a line, affecting trigger execution and output buffering.

### Impact on Original Plan

**Phase 2.1 Needs Revision**:
- Original plan: Move `ansiParser.ts` from `@web` to `@client/ansi/`
- New consideration: Relationship between `ansiParser.ts` and `AnsiAwareBuffer`
- Question: Should these be consolidated or kept separate?

**Analysis**:
- `ansiParser.ts` → HTML rendering (potentially web-specific)
- `AnsiAwareBuffer` → Format state tracking (client-agnostic)
- May serve different purposes in the pipeline

**Recommendation**:
- Move `ansiParser.ts` to `@client/ansi/` as originally planned
- ANSI parsing is fundamentally client-level functionality
- Web layer should only consume parsed/formatted output
- This resolves the circular dependency

---

## Phase 1: Complete React Migration Strategy

**Priority**: Critical
**Estimated Effort**: 8-12 hours (expanded from original 2-4 hours)
**Dependencies**: None

### Objectives
- **Full React Application**: Migrate entire frontend to React
- **React Islands**: Create non-React "islands" for map rendering and terminal output
- **Remove Legacy Components**: Delete all vanilla JS class-based UI components
- **Single Root**: Establish single React root managing entire application state

### Background

The current architecture is a **hybrid** with React components coexisting alongside vanilla JavaScript:
- **10 duplicate components** (React versions already exist, class versions still in use)
- **Complex vanilla UI**: ObjectList, CharState, MultiBinds with direct DOM manipulation
- **Mobile UI**: MobileDirectionButtons, MobileCommandRadial (vanilla with complex state)
- **Map Rendering**: EmbeddedMap wrapper around `mudlet-map-renderer` library
- **Terminal Output**: OutputMessageHandler with AnsiAwareBuffer integration
- **Main Bootstrap**: `main.ts` (1708 lines) with extensive vanilla DOM setup

### React Island Strategy

Some components need to remain non-React for performance/architectural reasons:

#### Island 1: Map Rendering
- **Current**: `src/web/embed.ts` - Vanilla wrapper around `mudlet-map-renderer`
- **Target**: Keep as non-React island, wrap in React portal/ref
- **Reason**: External library with custom rendering engine (likely canvas/WebGL)
- **Integration**: React component manages mount/unmount, passes props, but doesn't control rendering

#### Island 2: Terminal Output
- **Current**: `src/shared/dom/outputMessageHandler.ts` - Direct DOM manipulation for performance
- **Target**: Keep core rendering as non-React, wrap in React component
- **Reason**: High-frequency updates (hundreds of messages), AnsiAwareBuffer optimization
- **Integration**: React manages container, vanilla handler manages message elements

### Tasks

#### 1.1 Create React Root Architecture

Create `src/ui/web/App.tsx` as the main application component:
```typescript
// New single root application
export function App() {
  return (
    <AppProvider> {/* Global state */}
      <Layout>
        <Header />
        <MainContent>
          <TerminalIsland /> {/* Non-React island */}
          <MapIsland />       {/* Non-React island */}
        </MainContent>
        <StatusBar>
          <CharState />
          <Timers />
        </StatusBar>
        <Panels />
        <Modals />
      </Layout>
    </AppProvider>
  )
}
```

#### 1.2 Migrate Duplicate Components (Already Exists in React)

**Components to verify and switch to**:
- ✓ CombatTimer → `src/ui/web/components/timers/CombatTimer.tsx`
- ✓ CoverTimer → `src/ui/web/components/timers/CoverTimer.tsx`
- ✓ LampTimer → `src/ui/web/components/timers/LampTimer.tsx`
- ✓ TransportTimer → `src/ui/web/components/timers/TransportTimer.tsx`
- ✓ ZaskTimer → `src/ui/web/components/timers/ZaskTimer.tsx`
- ✓ BreakItemWarning → `src/ui/web/components/panels/BreakItemWarning.tsx`
- ✓ MultiBinds → `src/ui/web/components/panels/MultiBinds.tsx`
- ✓ ReleaseGuard → `src/ui/web/components/panels/ReleaseGuard.tsx`

**Delete legacy class versions**:
```bash
rm src/web/CombatTimer.ts
rm src/web/CoverTimer.ts
rm src/web/LampTimer.ts
rm src/web/TransportTimer.ts
rm src/web/ZaskTimer.ts
rm src/web/BreakItemWarning.ts
rm src/web/MultiBinds.ts
rm src/web/ReleaseGuard.ts
```

#### 1.3 Migrate Complex Vanilla Components to React

**CharState** (`src/web/CharState.ts` → React)
- 4 display modes (text, bar variations)
- Dynamic color coding
- Emoji label support
- **Target**: `src/ui/web/components/panels/CharState.tsx` (already exists, verify feature parity)

**CharStateInfo** (`src/web/CharStateInfo.ts` → React)
- Character state text display
- **Target**: `src/ui/web/components/panels/CharStateInfo.tsx` (already exists, verify)

**Delete after migration**:
```bash
rm src/web/CharState.ts
rm src/web/CharStateInfo.ts
```

#### 1.4 Migrate ObjectList to React

**Current**: `src/web/ObjectList.ts` (complex vanilla class)
- Draggable window with pointer events
- Picture-in-Picture support
- Dynamic HP bars and attack indicators
- Click handlers for combat targeting
- MutationObserver for DOM changes

**Target**: Create `src/ui/web/components/combat/ObjectList.tsx`
- Use React DnD or similar for drag
- Use React Portal for PiP
- Convert to React state management
- Replace MutationObserver with React lifecycle

**Steps**:
1. Create React component with same functionality
2. Test thoroughly (combat targeting critical)
3. Delete `src/web/ObjectList.ts`

#### 1.5 Migrate MultiBinds to React

**Current**: `src/web/MultiBinds.ts` (dynamic button generation)
- Pure HTML element creation
- Dynamic buttons from server data
- Active state management

**Target**: Use existing `src/ui/web/components/panels/MultiBinds.tsx`
- Verify it handles dynamic button generation
- Ensure active state management works
- Delete `src/web/MultiBinds.ts`

#### 1.6 Migrate Browser Title Updates

**Current**:
- `src/web/FightTitle.ts` - Updates title with ⚔/ㅤ
- `src/web/HpTitle.ts` - Adds HP display to title

**Target**: Create `src/ui/web/hooks/useDocumentTitle.ts`
```typescript
export function useDocumentTitle() {
  const { fighting, hp, maxHp } = useGameState()

  useEffect(() => {
    const fightIcon = fighting ? '⚔' : 'ㅤ'
    const hpText = `[${hp}/${maxHp}]`
    document.title = `${fightIcon} ${hpText} Arkadia`
  }, [fighting, hp, maxHp])
}
```

**Delete**:
```bash
rm src/web/FightTitle.ts
rm src/web/HpTitle.ts
```

#### 1.7 Migrate Mobile UI Components

**MobileDirectionButtons** (`src/web/scripts/mobileDirectionButtons.ts`)
- Complex drag/long-press handling
- Orientation detection
- Haptic feedback
- Team/leader mode state

**Target**: Create `src/ui/web/components/mobile/DirectionButtons.tsx`
- Use React hooks for gesture handling (react-use-gesture or similar)
- Maintain all existing functionality
- Better state management with React

**MobileCommandRadial** (`src/web/scripts/mobileCommandRadial.ts`)
- Radial menu for commands

**Target**: Create `src/ui/web/components/mobile/CommandRadial.tsx`

**Delete after migration**:
```bash
rm src/web/scripts/mobileDirectionButtons.ts
rm src/web/scripts/mobileCommandRadial.ts
```

#### 1.8 Create React Islands for Performance-Critical Components

##### Terminal Output Island

**Current**: `src/shared/dom/outputMessageHandler.ts`
- High-frequency updates (hundreds of messages)
- AnsiAwareBuffer integration
- Direct DOM manipulation for performance

**Target**: Create `src/ui/web/islands/TerminalIsland.tsx`
```typescript
export function TerminalIsland() {
  const containerRef = useRef<HTMLDivElement>(null)
  const handlerRef = useRef<OutputMessageHandler>()

  useEffect(() => {
    if (containerRef.current) {
      handlerRef.current = new OutputMessageHandler(containerRef.current)

      // Subscribe to output events
      arkadiaClient.on('output', (text, type) => {
        handlerRef.current?.addMessage(text, type)
      })
    }

    return () => handlerRef.current?.cleanup()
  }, [])

  return <div ref={containerRef} id="output" />
}
```

**Keep vanilla handler**: `outputMessageHandler.ts` remains for performance
**Integration**: React manages lifecycle, vanilla handles rendering

##### Map Rendering Island

**Current**: `src/web/embed.ts` - Wrapper around `mudlet-map-renderer`

**Target**: Create `src/ui/web/islands/MapIsland.tsx`
```typescript
export function MapIsland() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<EmbeddedMap>()

  const { currentRoom, path, settings } = useMapState()

  useEffect(() => {
    if (containerRef.current) {
      mapRef.current = new EmbeddedMap(containerRef.current)
      mapRef.current.initialize()
    }

    return () => mapRef.current?.cleanup()
  }, [])

  // Update map when state changes
  useEffect(() => {
    mapRef.current?.setCurrentRoom(currentRoom)
  }, [currentRoom])

  useEffect(() => {
    mapRef.current?.setPath(path)
  }, [path])

  return <div ref={containerRef} id="map-container" />
}
```

**Keep vanilla wrapper**: `embed.ts` remains, wrapped in React
**Integration**: React provides data, vanilla handles rendering

#### 1.9 Migrate LetterComposer to React

**Current**: `src/web/LetterComposer.ts` (modal with form)
- Draggable window
- Form state management
- LocalStorage integration

**Target**: Create `src/ui/web/components/modals/LetterComposer.tsx`
- Use React Hook Form or similar
- React DnD for dragging
- React state for form data
- Easy integration with existing React modal system

**Delete**:
```bash
rm src/web/LetterComposer.ts
```

#### 1.10 Extract Modal/Dialog Management to React

**Current**: `main.ts` has extensive modal setup code

**Target**: Create React-based modal system
- `src/ui/web/components/modals/ModalProvider.tsx`
- `src/ui/web/hooks/useModal.ts`
- Centralized modal state management

**Modals to migrate**:
- Connection modal
- Settings modal
- Letter composer
- Help modal
- About modal

#### 1.11 Refactor main.ts to React Bootstrap

**Current**: 1708 lines of vanilla initialization

**Target**: Slim bootstrap that mounts React app
```typescript
// src/web/main.ts (new)
import { createRoot } from 'react-dom/client'
import { App } from '@web-ui/App'
import { initializeClient } from './initialization'

async function main() {
  // 1. Initialize core client (non-UI)
  const client = await initializeClient()

  // 2. Mount React application
  const root = createRoot(document.getElementById('app')!)
  root.render(<App client={client} />)

  console.log('Application initialized')
}

main()
```

**Result**: Reduce from 1708 lines to ~50-100 lines

#### 1.12 Create Global State Management

**Options**:
1. **React Context + useReducer** (lightweight, built-in)
2. **Zustand** (minimal, modern)
3. **Redux Toolkit** (if complex state needed)

**Recommended**: Zustand for simplicity

Create `src/ui/web/stores/gameState.ts`:
```typescript
import { create } from 'zustand'

interface GameState {
  // Character state
  hp: number
  maxHp: number
  mana: number

  // Combat state
  fighting: boolean
  targets: Target[]

  // Timers
  combatTimer: number
  lampTimer: number

  // Map state
  currentRoom: number
  path: number[]

  // Actions
  updateVitals: (vitals: Vitals) => void
  setFighting: (fighting: boolean) => void
  // ... etc
}

export const useGameState = create<GameState>((set) => ({
  // ... implementation
}))
```

#### 1.13 Run Tests and Verify

```bash
yarn test
yarn test:e2e
yarn build
```

### Success Criteria
- ✅ Single React root application
- ✅ All legacy vanilla components migrated or deleted
- ✅ Terminal and Map as React islands (lifecycle managed by React)
- ✅ Global state management in place
- ✅ main.ts reduced to ~50-100 lines
- ✅ All tests passing
- ✅ Build successful
- ✅ No regressions in functionality
- ✅ ~1000+ lines of legacy code removed
- ✅ Better maintainability and testability

### Migration Path

1. **Phase 1a** (2-3 hours): Delete duplicate components, verify React versions work
2. **Phase 1b** (3-4 hours): Create React islands (Terminal, Map)
3. **Phase 1c** (2-3 hours): Migrate complex components (ObjectList, Mobile UI)
4. **Phase 1d** (2-3 hours): Set up global state, create App root, refactor main.ts
5. **Phase 1e** (1-2 hours): Testing, verification, cleanup

---

## Phase 2: Break Circular Dependencies

**Priority**: High
**Estimated Effort**: 3-5 hours
**Dependencies**: Phase 1

### Objectives
- Establish unidirectional dependency flow
- Move misplaced files to correct locations
- Client no longer depends on Web

### Tasks

#### 2.1 Consolidate ANSI Handling

**Current State**:
- `src/web/ansiParser.ts` (112 lines) - Converts ANSI codes to HTML spans
- `src/client/ansi/FormatState.ts` (600+ lines) - AnsiAwareBuffer for state tracking
- `src/web/ArkadiaClient.ts:1` imports from `@web/ansiParser` (circular dependency)

**Target**: Move ansiParser to `src/client/ansi/ansiParser.ts`

**Rationale**:
- ANSI parsing is core client functionality, not web-specific
- Both components handle ANSI codes but serve different purposes:
  - `ansiParser.ts` → HTML rendering (final output)
  - `AnsiAwareBuffer` → Format state tracking (intermediate processing)
- Moving resolves circular dependency

**Steps**:
1. Move file:
   ```bash
   git mv src/web/ansiParser.ts src/client/ansi/ansiParser.ts
   ```

2. Update imports in affected files:
   ```typescript
   // OLD:
   import {parseAnsiPatterns} from "@web/ansiParser";

   // NEW:
   import {parseAnsiPatterns} from "@client/ansi/ansiParser";
   ```

3. Update path alias if needed in `vite.config.ts` and `tsconfig.base.json`

4. Verify AnsiAwareBuffer and ansiParser work together correctly

5. Run tests

**Files to update**:
- `src/web/ArkadiaClient.ts` (main import)
- `test/web/ansiParser.test.ts` (test file imports)
- Any other files importing from `@web/ansiParser`

**Note**: Keep both `ansiParser.ts` and `FormatState.ts` separate - they serve different stages in the ANSI processing pipeline.

#### 2.2 Consolidate DataStores

**Current**:
```
src/modules/data/dataStores/
├── herbsStore.ts
├── knowledgeStore.ts
├── knowledgeDetailsStore.ts
├── magicKeysStore.ts
└── magicsStore.ts

src/web/dataStores/
├── mapStore.ts
├── multibindStore.ts
└── npcStore.ts
```

**Target**:
```
src/modules/data/dataStores/
├── herbsStore.ts
├── knowledgeStore.ts
├── knowledgeDetailsStore.ts
├── magicKeysStore.ts
├── magicsStore.ts
├── mapStore.ts         ← moved
├── multibindStore.ts   ← moved
└── npcStore.ts         ← moved
```

**Steps**:
1. Move files:
   ```bash
   git mv src/web/dataStores/mapStore.ts src/modules/data/dataStores/
   git mv src/web/dataStores/multibindStore.ts src/modules/data/dataStores/
   git mv src/web/dataStores/npcStore.ts src/modules/data/dataStores/
   ```

2. Remove empty directory:
   ```bash
   rmdir src/web/dataStores
   ```

3. Update all imports:
   ```typescript
   // OLD:
   import { addLocalNpc } from "@web/dataStores/npcStore";
   import { multibindStore } from "@web/dataStores/multibindStore";

   // NEW:
   import { addLocalNpc } from "@modules/data/dataStores/npcStore";
   import { multibindStore } from "@modules/data/dataStores/multibindStore";
   ```

4. Run tests

**Files to update**:
- `src/client/PackageHelper.ts`
- `src/client/scripts/multibinds.ts`
- `src/web/main.ts`
- Any other files importing from `@web/dataStores/*`

#### 2.3 Remove MockPort Abstraction

**Current State**:
- `src/web/MockPort.ts` acts as a message-based wrapper around `storage`
- `Client` receives a `port` parameter and uses `port.postMessage()` / `port.onMessage`
- MockPort translates between message-based API and direct storage API
- Adds unnecessary abstraction layer

**Target**: Direct storage interactions in Client

**Rationale**:
- MockPort serves no real purpose - it's just a storage wrapper with message API
- Direct storage usage is simpler and more straightforward
- `storage.onChanged` already provides change notifications
- Reduces indirection and makes code easier to understand

**Steps**:
1. Update `Client` constructor to remove `port` parameter:
   ```typescript
   // OLD:
   constructor(clientAdapter: ClientAdapter, port: any) {
     this.port = port;
     port.onMessage.addListener((message) => { ... });
   }

   // NEW:
   import storage from "@modules/core/storage";

   constructor(clientAdapter: ClientAdapter) {
     // Setup storage listeners directly
     storage.onChanged?.addListener((changes) => {
       Object.entries(changes).forEach(([key, {newValue}]) => {
         this.sendEvent(key, newValue);
       });
     });
   }
   ```

2. Replace `port.postMessage` calls with direct storage calls:
   ```typescript
   // OLD:
   port.postMessage({type: 'GET_STORAGE', key: 'scripts'})

   // NEW:
   import { getItemSync } from "@modules/core/storage";
   const data = getItemSync('scripts');
   this.sendEvent('scripts', data?.scripts);
   ```

3. Update `Client.connect()` method - no longer needs port parameter:
   ```typescript
   // OLD:
   connect(port: any, initial: boolean) {
     if (initial) {
       port.postMessage({type: 'GET_STORAGE', key: 'scripts'})
     }
     this.port = port
     this.sendEvent('port-connected')
   }

   // NEW:
   connect(initial: boolean) {
     if (initial) {
       const data = getItemSync('scripts');
       this.sendEvent('scripts', data?.scripts);
     }
     this.sendEvent('port-connected')
   }
   ```

4. Update Client instantiation in `main.ts`:
   ```typescript
   // OLD:
   const client = new Client(arkadiaClient, new MockPort());

   // NEW:
   const client = new Client(arkadiaClient);
   ```

5. Delete `src/web/MockPort.ts`

6. Remove MockPort from test files

7. Run tests

**Files to update**:
- `src/client/Client.ts` (constructor, connect method, port usage)
- `src/web/main.ts` (Client instantiation)
- All test files that mock port (use storage mocks instead)

**Benefits**:
- ~50 lines of unnecessary abstraction removed
- Clearer code - direct storage access instead of message passing
- Easier to test - mock storage instead of port
- One less file to maintain

#### 2.4 Verify Dependency Flow

After Phase 2.1, 2.2, and 2.3, verify no circular dependencies:

```bash
# Check client doesn't import from web
grep -r "@web" src/client/

# Should return: NO MATCHES
```

### Success Criteria
- ✅ No imports from `@web` in `src/client/`
- ✅ All dataStores in one location
- ✅ MockPort removed, direct storage usage
- ✅ All tests passing
- ✅ Clean dependency hierarchy

---

## Phase 3: Consolidate Type Definitions

**Priority**: Medium
**Estimated Effort**: 2-3 hours
**Dependencies**: Phase 2

### Objectives
- Single source of truth for all type definitions
- Remove duplicate types
- Organize types by scope (shared vs platform-specific)

### Tasks

#### 3.1 Create Shared Types Directory
```bash
mkdir -p src/shared/types
```

#### 3.2 Move Domain Types to Shared

**Types to move from `src/client/types/` to `src/shared/types/`**:
- `herbs.ts` (domain type, used by both client and web)
- `letter.ts` (domain type)
- `people.ts` (domain type)
- `transport.ts` (domain type)

**Steps**:
```bash
git mv src/client/types/herbs.ts src/shared/types/
git mv src/client/types/letter.ts src/shared/types/
git mv src/client/types/people.ts src/shared/types/
git mv src/client/types/transport.ts src/shared/types/
```

#### 3.3 Consolidate MapData Type

**Current**:
- `src/client/types/MapData.d.ts`
- `src/web/types/MapData.d.ts` (slightly different)

**Steps**:
1. Compare both files and merge into comprehensive version
2. Create `src/shared/types/MapData.d.ts` with merged definition
3. Delete both old versions
4. Update all imports

#### 3.4 Organize Platform-Specific Types

**Keep in `src/client/types/`** (client-specific):
- `global.d.ts` (client-specific globals)
- `wasm.d.ts` (client-specific)
- `uiSettingsEvent.ts` (if client-specific)

**Keep in `src/web/types/`** (web-specific):
- `vite-env.d.ts` (build-specific)
- `documentPictureInPicture.d.ts` (web API)
- `commit-info.d.ts` (build-specific)
- `md.d.ts` (build-specific)

#### 3.5 Create Barrel Exports
```typescript
// src/shared/types/index.ts
export * from './MapData';
export * from './herbs';
export * from './letter';
export * from './people';
export * from './transport';
```

#### 3.6 Update All Imports
```typescript
// OLD:
import { HerbData } from "@client/types/herbs";

// NEW:
import { HerbData } from "@shared/types";
```

### Success Criteria
- ✅ No duplicate type definitions
- ✅ Clear separation: shared vs platform-specific types
- ✅ All imports updated
- ✅ All tests passing

---

## Phase 4: Reorganize Web Directory

**Priority**: Medium
**Estimated Effort**: 3-4 hours
**Dependencies**: Phase 1, 2

### Objectives
- Clear separation of concerns in `src/web/`
- Group files by purpose/domain
- Easier navigation and understanding

### Current Structure (Flat and Mixed)
```
src/web/
├── ArkadiaClient.ts
├── ansiParser.ts (MOVED in Phase 2.1)
├── CombatTimer.ts (DELETED in Phase 1)
├── embed.ts
├── FightTitle.ts
├── fontLoader.ts
├── HpTitle.ts
├── logBrowser.ts
├── main.ts
├── mapDataLoader.ts
├── MockPort.ts (DELETED in Phase 2.3)
├── ObjectList.ts
├── sessionLogger.ts
├── statusIndicators.ts
├── dataStores/ (MOVED in Phase 2)
├── herbs/
├── options/
├── scripts/
├── stores/ (empty)
└── types/
```

### Target Structure (Organized by Purpose)
```
src/web/
├── adapters/
│   └── ArkadiaClient.ts
├── loaders/
│   ├── fontLoader.ts
│   └── mapDataLoader.ts
├── integrations/
│   ├── embed.ts
│   ├── logBrowser.ts
│   └── sessionLogger.ts
├── ui-legacy/
│   ├── FightTitle.ts
│   ├── HpTitle.ts
│   ├── ObjectList.ts
│   └── statusIndicators.ts
├── initialization/
│   ├── initializeClient.ts
│   ├── initializeUI.ts
│   ├── initializeEventHandlers.ts
│   └── initializeOptions.ts
├── herbs/
│   └── HerbManager.tsx
├── options/
│   └── (keep as-is - 25 files)
├── scripts/
│   ├── mobileDirectionButtons.ts
│   └── mobileCommandRadial.ts
├── types/
│   └── (platform-specific types only)
└── main.ts
```

### Tasks

#### 4.1 Create New Directories
```bash
mkdir -p src/web/adapters
mkdir -p src/web/loaders
mkdir -p src/web/integrations
mkdir -p src/web/ui-legacy
mkdir -p src/web/initialization
```

#### 4.2 Move Files to Adapters
```bash
git mv src/web/ArkadiaClient.ts src/web/adapters/
```

Create `src/web/adapters/index.ts`:
```typescript
export { default as ArkadiaClient } from './ArkadiaClient';
```

#### 4.3 Move Files to Loaders
```bash
git mv src/web/fontLoader.ts src/web/loaders/
git mv src/web/mapDataLoader.ts src/web/loaders/
```

Create `src/web/loaders/index.ts`:
```typescript
export * from './fontLoader';
export * from './mapDataLoader';
```

#### 4.4 Move Files to Integrations
```bash
git mv src/web/embed.ts src/web/integrations/
git mv src/web/logBrowser.ts src/web/integrations/
git mv src/web/sessionLogger.ts src/web/integrations/
```

Create `src/web/integrations/index.ts`:
```typescript
export * from './embed';
export * from './logBrowser';
export * from './sessionLogger';
```

#### 4.5 Move Files to UI Legacy
```bash
git mv src/web/FightTitle.ts src/web/ui-legacy/
git mv src/web/HpTitle.ts src/web/ui-legacy/
git mv src/web/ObjectList.ts src/web/ui-legacy/
git mv src/web/statusIndicators.ts src/web/ui-legacy/
```

Create `src/web/ui-legacy/index.ts`:
```typescript
export { default as FightTitle } from './FightTitle';
export { default as HpTitle } from './HpTitle';
export { default as ObjectList } from './ObjectList';
export * from './statusIndicators';
```

#### 4.6 Remove Empty Directory
```bash
rmdir src/web/stores
```

#### 4.7 Update All Imports
Update imports in `main.ts` and other files:
```typescript
// OLD:
import ArkadiaClient from "./ArkadiaClient";
import { loadFonts } from "./fontLoader";
import { createSessionLogger } from "./sessionLogger";

// NEW:
import { ArkadiaClient } from "./adapters";
import { loadFonts } from "./loaders";
import { createSessionLogger } from "./integrations";
```

### Success Criteria
- ✅ Clear directory organization
- ✅ Barrel exports for cleaner imports
- ✅ All tests passing
- ✅ Easier to locate files

---

## Phase 5: Refactor main.ts

**Priority**: Medium
**Estimated Effort**: 4-6 hours
**Dependencies**: Phase 4

### Objectives
- Break down 1577-line entry point
- Extract initialization logic into modules
- Keep `main.ts` as thin orchestrator
- Improve testability

### Current Issues
- `main.ts` is 1577 lines
- Mixes concerns: initialization, event handling, UI mounting, options setup
- Hard to test
- Hard to understand initialization flow

### Target Structure
```
src/web/
├── initialization/
│   ├── initializeClient.ts      (~150-200 lines)
│   ├── initializeUI.ts          (~200-250 lines)
│   ├── initializeEventHandlers.ts (~300-400 lines)
│   ├── initializeOptions.ts     (~200-300 lines)
│   └── index.ts                 (barrel export)
└── main.ts                       (~50-100 lines)
```

### Tasks

#### 5.1 Extract Client Initialization

Create `src/web/initialization/initializeClient.ts`:
```typescript
import Client from "@client/Client";
import { ArkadiaClient } from "../adapters";

export async function initializeClient(): Promise<ArkadiaClient> {
  // Extract all client initialization code from main.ts
  // - Client instantiation
  // - Socket setup
  // - GMCP setup
  // - Initial state

  const client = new Client();
  const arkadiaClient = new ArkadiaClient(client);

  // ... setup logic

  return arkadiaClient;
}
```

#### 5.2 Extract UI Initialization

Create `src/web/initialization/initializeUI.ts`:
```typescript
import { mountComponents } from "@web-ui/mountComponents";

export function initializeUI(client: ArkadiaClient): void {
  // Extract all UI mounting code from main.ts
  // - Mount React components
  // - Setup legacy UI elements
  // - Initialize panels
  // - Setup DOM elements

  mountComponents(client);

  // ... other UI setup
}
```

#### 5.3 Extract Event Handler Initialization

Create `src/web/initialization/initializeEventHandlers.ts`:
```typescript
import eventBus from "@modules/core/eventBus";

export function initializeEventHandlers(client: ArkadiaClient): void {
  // Extract all event handler setup from main.ts
  // - eventBus listeners
  // - window event listeners
  // - custom event handlers
  // - message handlers

  eventBus.on("combatTimer", handleCombatTimer);
  eventBus.on("gmcp.Char.Vitals", handleVitals);

  // ... hundreds of event handlers
}
```

#### 5.4 Extract Options Initialization

Create `src/web/initialization/initializeOptions.ts`:
```typescript
import storage from "@modules/core/storage";

export async function initializeOptions(client: ArkadiaClient): Promise<void> {
  // Extract all options/settings initialization from main.ts
  // - Load saved settings
  // - Apply settings
  // - Setup options UI
  // - Bind settings events

  const settings = await storage.getItem('settings');

  // ... settings logic
}
```

#### 5.5 Create Barrel Export

Create `src/web/initialization/index.ts`:
```typescript
export { initializeClient } from './initializeClient';
export { initializeUI } from './initializeUI';
export { initializeEventHandlers } from './initializeEventHandlers';
export { initializeOptions } from './initializeOptions';
```

#### 5.6 Refactor main.ts

Simplify `main.ts` to orchestrate initialization:
```typescript
import {
  initializeClient,
  initializeUI,
  initializeEventHandlers,
  initializeOptions
} from './initialization';

async function main() {
  try {
    // 1. Initialize client
    const client = await initializeClient();

    // 2. Initialize UI
    initializeUI(client);

    // 3. Setup event handlers
    initializeEventHandlers(client);

    // 4. Load and apply options
    await initializeOptions(client);

    // 5. Start client
    await client.connect();

    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
}

main();
```

**Result**: `main.ts` reduced from 1577 lines to ~50-100 lines

### Success Criteria
- ✅ `main.ts` < 200 lines
- ✅ Clear separation of initialization concerns
- ✅ Initialization modules are testable
- ✅ All tests passing
- ✅ Application works identically

---

## Phase 6: Documentation & Cleanup

**Priority**: Low
**Estimated Effort**: 2-3 hours
**Dependencies**: All previous phases

### Objectives
- Document new architecture
- Establish coding standards
- Create migration guides
- Clean up remnants

### Tasks

#### 6.1 Create Architecture Documentation

Create `docs/architecture/DIRECTORY_STRUCTURE.md`:
```markdown
# Directory Structure Guide

## Overview
This document explains the organization of the codebase and where different types of code should live.

## Directory Layout
...
```

Create `docs/architecture/IMPORT_RULES.md`:
```markdown
# Import Rules and Dependency Guidelines

## Dependency Hierarchy
The codebase follows a strict unidirectional dependency flow:
...
```

Create `docs/architecture/COMPONENT_MIGRATION.md`:
```markdown
# Component Migration Guide

## From Class to React
This guide explains how to migrate legacy class-based components to React...
```

#### 6.2 Fix Deep Relative Imports

Find and fix any remaining deep relative imports:
```bash
# Find files with deep relative imports
grep -r "../../../../" src/

# Replace with path aliases
# Example: ../../../../shared/events → @shared/events
```

#### 6.3 Add JSDoc to Key Components

Add documentation to key architectural files:
```typescript
/**
 * Main game client class.
 * Handles connection to game server, processes game state, and manages triggers.
 *
 * @example
 * const client = new Client();
 * await client.connect();
 */
export default class Client {
  // ...
}
```

#### 6.4 Update README

Update main `README.md` with:
- Architecture overview
- Directory structure explanation
- Links to architecture docs
- Development guidelines

### Success Criteria
- ✅ Architecture documented
- ✅ Import rules clear
- ✅ No deep relative imports
- ✅ Key components documented

---

## Phase 7: Optional Enhancements

**Priority**: Optional
**Estimated Effort**: Varies
**Dependencies**: Phase 1-6

### 7.1 Feature-Based UI Organization

**Current**: Type-based organization (timers/, panels/)
**Alternative**: Feature-based organization

```
src/ui/web/features/
├── combat/
│   ├── CombatTimer.tsx
│   ├── AttackMode.tsx
│   └── index.ts
├── character/
│   ├── CharState.tsx
│   ├── CharStateInfo.tsx
│   └── index.ts
├── timers/
│   ├── LampTimer.tsx
│   ├── CoverTimer.tsx
│   ├── ZaskTimer.tsx
│   ├── TransportTimer.tsx
│   └── index.ts
└── packages/
    ├── PackageStatus.tsx
    ├── ReleaseGuard.tsx
    └── index.ts
```

**Pros**:
- Related components grouped together
- Easier to understand feature domains
- Better code locality

**Cons**:
- More directories
- Requires more reorganization

### 7.2 Co-locate Tests with Source

**Current**: Tests in separate `test/` directory
**Alternative**: Tests adjacent to source files

```
src/client/ansi/
├── FormatState.ts
├── FormatState.test.ts
├── ansiParser.ts
└── ansiParser.test.ts
```

**Pros**:
- Easier to find tests
- Clear test coverage
- Tests move with code

**Cons**:
- Build configuration changes needed
- More files in source directories

### 7.3 Introduce Dependency Injection

Replace direct imports with dependency injection for better testability:

```typescript
// Before
import storage from "@modules/core/storage";

class Client {
  async saveData() {
    await storage.setItem('key', 'value');
  }
}

// After
interface Storage {
  setItem(key: string, value: any): Promise<void>;
}

class Client {
  constructor(private storage: Storage) {}

  async saveData() {
    await this.storage.setItem('key', 'value');
  }
}
```

**Pros**:
- Much easier to test
- Clearer dependencies
- More flexible

**Cons**:
- Major refactoring required
- Learning curve

---

## Implementation Timeline

### Sprint 1 (Week 1)
- ✅ **Phase 1: Complete React Migration** (8-12 hours) - **EXPANDED SCOPE**
  - Phase 1a: Delete duplicates, verify React versions (2-3 hours)
  - Phase 1b: Create React islands (Terminal, Map) (3-4 hours)
  - Phase 1c: Migrate complex components (ObjectList, Mobile UI) (2-3 hours)
  - Phase 1d: Set up state management, App root, refactor main.ts (2-3 hours)
  - Phase 1e: Testing and cleanup (1-2 hours)

### Sprint 2 (Week 2)
- ✅ **Phase 2: Break Circular Dependencies** (3-5 hours)
  - Phase 2.1: Consolidate ANSI handling
  - Phase 2.2: Consolidate DataStores
  - Phase 2.3: Remove MockPort abstraction
  - Phase 2.4: Verify dependency flow

### Sprint 3 (Week 3)
- ✅ **Phase 3: Consolidate Type Definitions** (2-3 hours)
- ✅ **Phase 4: Reorganize Web Directory** (3-4 hours)

### Sprint 4 (Week 4)
- ✅ **Phase 5: Refactor main.ts** (2-3 hours) - **REDUCED** (most work moved to Phase 1)
- ✅ **Phase 6: Documentation & Cleanup** (2-3 hours)
- ✅ Final testing and validation

### Optional (Future)
- Phase 7: Optional enhancements as needed

**Total Estimated Effort**: 20-30 hours (increased from original 16-23 hours due to complete React migration)

---

## Success Metrics

### Code Quality Metrics
- ✅ Zero circular dependencies
- ✅ Zero duplicate components
- ✅ Zero duplicate type definitions
- ✅ main.ts < 200 lines
- ✅ All dataStores in one location

### Test Metrics
- ✅ All 487 unit tests passing
- ✅ All E2E tests passing
- ✅ Build successful with no errors
- ✅ No new console warnings

### Architecture Metrics
- ✅ Clear dependency hierarchy documented
- ✅ Barrel exports for all major modules
- ✅ No deep relative imports (> 2 levels)

### Documentation Metrics
- ✅ Architecture docs created
- ✅ Import rules documented
- ✅ Migration guide created
- ✅ README updated

---

## Risk Assessment

### Low Risk
- Phase 0 (Documentation) - Completed, no code changes
- Phase 1 (Component Migration) - React components already working
- Phase 3 (Type Consolidation) - TypeScript will catch errors
- Phase 6 (Documentation) - No code changes

### Medium Risk
- Phase 2.1 (Move ansiParser) - Must verify interaction with AnsiAwareBuffer
- Phase 2.2 (Consolidate DataStores) - Requires careful import updates
- Phase 2.3 (Remove MockPort) - Changes Client constructor and test mocks
- Phase 4 (Reorganize Web) - Many file moves, but tests will catch issues

### High Risk
- Phase 5 (Refactor main.ts) - Critical entry point (1708 lines), needs thorough testing

### Mitigation Strategies
1. **Run tests after every phase**
2. **Use git branches for each phase**
3. **Incremental commits for easy rollback**
4. **Manual testing of critical flows**
5. **Code review before merging**

---

## Rollback Plan

Each phase should be done in a separate git branch:

```bash
git checkout -b phase-1-component-migration
# ... do work
yarn test && yarn build
git commit -m "Phase 1: Complete component migration"

git checkout migration-slices
git merge phase-1-component-migration

# If issues found:
git revert HEAD
# or
git reset --hard HEAD~1
```

---

## Notes

- This plan assumes the current codebase is on the `migration-slices` branch
- All tests must pass after each phase
- Each phase should be reviewable independently
- Documentation should be updated as changes are made, not at the end

---

## Appendix A: File Move Checklist

### Phase 1: React Migration - Delete Legacy Components
- [ ] src/web/CombatTimer.ts
- [ ] src/web/CoverTimer.ts
- [ ] src/web/LampTimer.ts
- [ ] src/web/TransportTimer.ts
- [ ] src/web/ZaskTimer.ts
- [ ] src/web/CharState.ts
- [ ] src/web/CharStateInfo.ts
- [ ] src/web/BreakItemWarning.ts
- [ ] src/web/MultiBinds.ts
- [ ] src/web/ReleaseGuard.ts
- [ ] src/web/FightTitle.ts
- [ ] src/web/HpTitle.ts
- [ ] src/web/ObjectList.ts
- [ ] src/web/LetterComposer.ts
- [ ] src/web/scripts/mobileDirectionButtons.ts
- [ ] src/web/scripts/mobileCommandRadial.ts

### Phase 1: React Migration - Create New Components
- [ ] src/ui/web/App.tsx (main application root)
- [ ] src/ui/web/islands/TerminalIsland.tsx
- [ ] src/ui/web/islands/MapIsland.tsx
- [ ] src/ui/web/components/combat/ObjectList.tsx
- [ ] src/ui/web/components/modals/LetterComposer.tsx
- [ ] src/ui/web/components/modals/ModalProvider.tsx
- [ ] src/ui/web/components/mobile/DirectionButtons.tsx
- [ ] src/ui/web/components/mobile/CommandRadial.tsx
- [ ] src/ui/web/hooks/useDocumentTitle.ts
- [ ] src/ui/web/hooks/useModal.ts
- [ ] src/ui/web/stores/gameState.ts

### Phase 2: Move/Delete
- [ ] src/web/ansiParser.ts → src/client/ansi/ansiParser.ts (Phase 2.1)
- [ ] src/web/dataStores/mapStore.ts → src/modules/data/dataStores/mapStore.ts (Phase 2.2)
- [ ] src/web/dataStores/multibindStore.ts → src/modules/data/dataStores/multibindStore.ts (Phase 2.2)
- [ ] src/web/dataStores/npcStore.ts → src/modules/data/dataStores/npcStore.ts (Phase 2.2)
- [ ] Delete src/web/MockPort.ts (Phase 2.3)

### Phase 3: Move
- [ ] src/client/types/herbs.ts → src/shared/types/herbs.ts
- [ ] src/client/types/letter.ts → src/shared/types/letter.ts
- [ ] src/client/types/people.ts → src/shared/types/people.ts
- [ ] src/client/types/transport.ts → src/shared/types/transport.ts
- [ ] src/client/types/MapData.d.ts → src/shared/types/MapData.d.ts (merge with web version)
- [ ] Delete src/web/types/MapData.d.ts

### Phase 4: Move
- [ ] src/web/ArkadiaClient.ts → src/web/adapters/ArkadiaClient.ts
- [ ] src/web/fontLoader.ts → src/web/loaders/fontLoader.ts
- [ ] src/web/mapDataLoader.ts → src/web/loaders/mapDataLoader.ts
- [ ] src/web/embed.ts → src/web/integrations/embed.ts
- [ ] src/web/logBrowser.ts → src/web/integrations/logBrowser.ts
- [ ] src/web/sessionLogger.ts → src/web/integrations/sessionLogger.ts
- [ ] src/web/FightTitle.ts → src/web/ui-legacy/FightTitle.ts
- [ ] src/web/HpTitle.ts → src/web/ui-legacy/HpTitle.ts
- [ ] src/web/ObjectList.ts → src/web/ui-legacy/ObjectList.ts
- [ ] src/web/statusIndicators.ts → src/web/ui-legacy/statusIndicators.ts

---

## Appendix B: Import Update Patterns

### Phase 2 Import Updates

```typescript
// ansiParser moves (Phase 2.1)
OLD: import { parseAnsiPatterns } from "@web/ansiParser";
NEW: import { parseAnsiPatterns } from "@client/ansi/ansiParser";

// AnsiAwareBuffer imports (already in place)
import { AnsiAwareBuffer } from "@client/ansi/FormatState";

// dataStores move (Phase 2.2)
OLD: import { addLocalNpc } from "@web/dataStores/npcStore";
NEW: import { addLocalNpc } from "@modules/data/dataStores/npcStore";

OLD: import { multibindStore } from "@web/dataStores/multibindStore";
NEW: import { multibindStore } from "@modules/data/dataStores/multibindStore";

OLD: import { mapStore } from "@web/dataStores/mapStore";
NEW: import { mapStore } from "@modules/data/dataStores/mapStore";

// MockPort removal (Phase 2.3)
OLD: import MockPort from "./MockPort";
     const client = new Client(arkadiaClient, new MockPort());
NEW: const client = new Client(arkadiaClient);

// In Client.ts:
OLD: constructor(clientAdapter: ClientAdapter, port: any) {
       this.port = port;
       port.onMessage.addListener((message) => { ... });
     }
NEW: import storage from "@modules/core/storage";
     constructor(clientAdapter: ClientAdapter) {
       storage.onChanged?.addListener((changes) => {
         Object.entries(changes).forEach(([key, {newValue}]) => {
           this.sendEvent(key, newValue);
         });
       });
     }

// In tests:
OLD: const mockPort = { postMessage: jest.fn(), onMessage: { addListener: jest.fn() } };
     const client = new Client(mockAdapter, mockPort);
NEW: jest.mock("@modules/core/storage");
     const client = new Client(mockAdapter);
```

### Phase 3 Import Updates

```typescript
// Type imports
OLD: import { HerbData } from "@client/types/herbs";
NEW: import { HerbData } from "@shared/types";

OLD: import { Letter } from "@client/types/letter";
NEW: import { Letter } from "@shared/types";

OLD: import { MapData } from "@client/types/MapData";
NEW: import { MapData } from "@shared/types";
```

### Phase 4 Import Updates

```typescript
// Adapter imports
OLD: import ArkadiaClient from "./ArkadiaClient";
NEW: import { ArkadiaClient } from "./adapters";

// Loader imports
OLD: import { loadFonts } from "./fontLoader";
NEW: import { loadFonts } from "./loaders";

// Integration imports
OLD: import { createSessionLogger } from "./sessionLogger";
NEW: import { createSessionLogger } from "./integrations";

// UI Legacy imports
OLD: import FightTitle from "./FightTitle";
NEW: import { FightTitle } from "./ui-legacy";
```

---

## Appendix C: Change Log

### 2025-11-19 Update (Major React Migration)
- **MAJOR**: Expanded Phase 1 to complete React migration (8-12 hours instead of 2-4)
- Introduced "React Islands" architecture for Map and Terminal output
- Documented all 16 legacy vanilla JS components requiring migration
- Added comprehensive analysis of non-React UI components:
  - 10 timer/status components (duplicates)
  - 3 complex vanilla classes (ObjectList, CharState, MultiBinds)
  - 2 mobile UI components
  - 2 browser title updaters
  - 1 modal (LetterComposer)
- Proposed single React root application with App.tsx
- Recommended Zustand for global state management
- Updated success criteria: ~1000+ lines of legacy code removal
- Expanded Appendix A with complete file deletion/creation checklist
- Added 5-phase migration path (Phase 1a-1e)

### 2025-11-19 Update (MockPort Removal)
- Added Phase 2.3: Remove MockPort abstraction
- MockPort identified as unnecessary wrapper around storage
- Updated Phase 4 to remove MockPort from file organization
- Updated risk assessment to include MockPort removal
- Added import patterns for direct storage usage
- Updated appendices with MockPort removal steps

### 2025-11-11 Update
- Added Phase 0 documenting recent architectural changes
- Documented AnsiAwareBuffer introduction (line processing improvement)
- Updated main.ts line count: 1577 → 1708 lines
- Revised Phase 2.1 to address ANSI handling consolidation
- Clarified relationship between ansiParser.ts and AnsiAwareBuffer
- Updated risk assessment to include AnsiAwareBuffer verification
- Added import patterns for AnsiAwareBuffer
- Identified `inLineProcess` TODO flag as area needing attention

### Key Changes Since Plan Creation
1. **AnsiAwareBuffer** - Major improvement to line processing and format state tracking
2. **Line Count Growth** - main.ts has grown, making Phase 5 more critical
3. **ANSI Architecture** - Now clear that two components serve different pipeline stages
4. **Client.inLineProcess** - Flagged for potential refactoring
5. **MockPort Removal** - Identified unnecessary abstraction layer for removal

---

**End of Architecture Reorganization Plan**

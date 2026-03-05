# Code & Architecture Reorganization Plan

**Status**: Planning Phase
**Created**: 2025-11-04
**Last Updated**: 2025-11-19 (Major React Migration Update)

---

## Executive Summary

This document outlines a comprehensive plan to reorganize the codebase architecture, **completing the React migration** and establishing clear separation of concerns. The plan now includes migrating the entire frontend to a single React application with strategic "islands" for performance-critical rendering.

**IMPORTANT - Testing Strategy**:
All phases must pass both unit tests (`yarn test`) and E2E tests (`yarn test:e2e`) before proceeding. The E2E tests cover a significant portion of the application's functionality and are critical for catching integration issues that unit tests might miss. Run E2E tests after completing each sub-phase and before committing any changes.

### Current Issues
- **16+ legacy vanilla JS components** coexisting with React versions
  - 10 duplicate components (class-based vs React)
  - 6 additional vanilla components (ObjectList, Mobile UI, Title updaters, LetterComposer)
- **Hybrid architecture**: Vanilla JS mixed with React, no single source of truth for UI state
- Circular dependencies between `@client` ↔ `@web`
- Oversized entry point (`main.ts` at 1708 lines, growing)
- DataStores split across multiple directories
- Duplicate type definitions
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

#### ANSI Handling

**`src/client/ansi/FormatState.ts`** (600+ lines)
- Platform-agnostic ANSI state tracking
- `AnsiAwareBuffer` for format-aware buffering
- Used throughout client for line processing
- Converts ANSI escape codes to DOM elements via `toDom()` method

#### Line Processing Architecture

The `inLineProcess` flag (Client.ts:96) has a TODO comment:
```typescript
inLineProcess = false; //TODO figure out something else
```

This suggests the line processing mechanism is still being refined. The flag is used to track whether the client is currently processing a line, affecting trigger execution and output buffering.

### Impact on Original Plan

**Phase 2.1 Update**:
- ✅ `ansiParser.ts` has been removed from the codebase
- ANSI rendering is now handled by `AnsiAwareBuffer.toDom()` method
- No circular dependency from ANSI handling
- Phase 2.1 can focus on DataStore consolidation only

---

## Phase 1: Complete React Migration Strategy

**Priority**: Critical
**Estimated Effort**: 15-20 hours (expanded to include full HTML migration)
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

#### 1.11 Refactor index.html to Minimal React Host

**Current**: 724-line HTML file with extensive hard-coded UI structure
- Multiple modal definitions (10+ modals with full structure)
- Hard-coded layout (`#main-container`, `#content-area`, `#char-state`, etc.)
- Mobile buttons hard-coded in HTML
- Letter composer form hard-coded
- All modals with Bootstrap structure

**Target**: Minimal React host - single mount point
```html
<!doctype html>
<html lang="en">
<head>
    <!-- Google Analytics -->
    <script>
        if (!window.__DISABLE_GA__) {
            (function() {
                var script = document.createElement('script');
                script.async = true;
                script.src = 'https://www.googletagmanager.com/gtag/js?id=G-25FPEMWGME';
                document.head.appendChild(script);

                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', 'G-25FPEMWGME');
            })();
        }
    </script>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">
    <meta name="apple-mobile-web-app-capable" content="yes"/>
    <meta name="mobile-web-app-capable" content="yes"/>
    <meta name="theme-color" content="#000000" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
    <title>Arkadia</title>
</head>
<body>
    <!-- Single React mount point -->
    <div id="root"></div>

    <!-- Legacy script entry points (to be removed after full migration) -->
    <script type="module" src="/src/web/main.ts"></script>
</body>
</html>
```

**Migrate to React Components**:

All current HTML structure becomes React components:

1. **Modals** (10+ modals) → `src/ui/web/components/modals/`
   - `OptionsModal.tsx`
   - `ExportImportModal.tsx`
   - `BindsModal.tsx`
   - `NpcModal.tsx`
   - `ScriptsModal.tsx`
   - `AliasesModal.tsx`
   - `TriggersModal.tsx`
   - `RecordingsModal.tsx`
   - `ShortcutsModal.tsx`
   - `UiSettingsModal.tsx`
   - `ManageSoundsModal.tsx`
   - `MobileButtonsModal.tsx`
   - `MobileRadialModal.tsx`
   - `TriggerTesterModal.tsx`
   - `TriggerFinderModal.tsx`
   - `LogsModal.tsx`
   - `LocationShareModal.tsx`

2. **Layout Structure** → `src/ui/web/components/layout/`
   - `MainContainer.tsx` (replaces `#main-container`)
   - `ContentArea.tsx` (replaces `#content-area`)
   - `InputArea.tsx` (replaces `#input-area`)
   - `Footer.tsx` (replaces `#char-state`)

3. **Mobile UI** → `src/ui/web/components/mobile/`
   - `DirectionButtons.tsx` (replaces `#mobile-direction-buttons`)
   - `CommandRadial.tsx` (replaces `#mobile-command-radial`)

4. **Auth Overlay** → `src/ui/web/components/auth/`
   - `AuthOverlay.tsx` (replaces `#auth-overlay`)
   - `ConnectionPanel.tsx`
   - `LoginForm.tsx`

5. **Letter Composer** → `src/ui/web/components/modals/`
   - `LetterComposer.tsx` (replaces `#letter-composer`)

**Result**:
- Reduce `index.html` from 724 lines to ~50 lines
- All UI structure managed by React
- Single source of truth for component structure
- Better testability (can test components in isolation)
- Easier to modify UI without touching HTML

#### 1.12 Refactor main.ts to React Bootstrap

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
  const root = createRoot(document.getElementById('root')!)
  root.render(<App client={client} />)

  console.log('Application initialized')
}

main()
```

**Result**: Reduce from 1708 lines to ~50-100 lines

#### 1.13 Create Global State Management

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

#### 1.14 Run Tests and Verify

**IMPORTANT**: Both unit tests and E2E tests must pass. The E2E tests cover a good chunk of the application's functionality and are critical for verifying the migration didn't break user-facing features.

```bash
# Run unit tests
yarn test

# Run E2E tests - CRITICAL for migration verification
yarn test:e2e

# Verify build succeeds
yarn build
```

**E2E Test Coverage**:
The E2E tests verify critical user workflows including:
- UI interaction (buttons, modals, input fields)
- Component rendering and state updates
- User flows (login, settings, navigation)
- Integration between components

**Testing Strategy**:
1. Run unit tests after each major component migration (1.2-1.9)
2. Run full E2E test suite after completing each sub-phase (1a, 1b, 1c, etc.)
3. Run both test suites before committing any changes
4. If E2E tests fail, investigate thoroughly - they often catch integration issues unit tests miss

### Success Criteria
- ✅ Single React root application
- ✅ All legacy vanilla components migrated or deleted
- ✅ Terminal and Map as React islands (lifecycle managed by React)
- ✅ Global state management in place
- ✅ index.html reduced from 724 lines to ~50 lines (single mount point)
- ✅ All modals (17+) migrated to React components
- ✅ All layout structure (main-container, content-area, input-area, footer) migrated to React
- ✅ Mobile UI (direction buttons, command radial) migrated to React
- ✅ Auth overlay migrated to React
- ✅ Letter composer migrated to React
- ✅ main.ts reduced to ~50-100 lines
- ✅ All tests passing
- ✅ Build successful
- ✅ No regressions in functionality
- ✅ ~1500+ lines of legacy code removed (1000+ from components, 700+ from index.html)
- ✅ Better maintainability and testability

### Migration Path

**Recommended execution order:**

1. **Phase 1a** (2-3 hours): Delete duplicate components, verify React versions work
2. **Phase 1b** (3-4 hours): Create React islands (Terminal, Map)
3. **Phase 1c** (2-3 hours): Migrate complex components (ObjectList, Mobile UI)
4. **Phase 1d** (3-4 hours): Set up global state, create App root
5. **Phase 1e** (3-4 hours): Migrate HTML structure to React (index.html → React components)
6. **Phase 1f** (2-3 hours): Refactor main.ts to slim bootstrap
7. **Phase 1g** (1-2 hours): Testing, verification, cleanup

**Note on execution order:**
- Steps 1.1-1.10 (component migration) should be done **before** 1.11 (index.html)
- Step 1.11 (index.html) should be done **before** 1.12 (main.ts refactor)
- Step 1.11 (index.html) requires all modals and layout components to be React components first
- Step 1.12 (main.ts) is the final orchestration that ties everything together

---

## Phase 1.5: Script-React State Integration

**Priority**: Critical (Foundational for Phase 1d)
**Estimated Effort**: 3-4 hours
**Dependencies**: Phase 1a, 1b
**Implement Before**: Phase 1d (state management setup)

### Background: Current Script System

The application has **90+ scripts** in `src/client/scripts/` that handle game logic:
- Combat timers, herb inventory, deposits, knowledge tracking
- Multibinds (room-specific keybinds)
- Lamp timers, transport timers, package status
- Attack modes, character state tracking

**Current Communication Pattern**:
```
Scripts (closure state)
    ↓ client.sendEvent()
eventBus
    ↓ useClientEvent()
React Components
```

**Current Issues**:
1. **No single source of truth**: State lives in script closures AND React component state
2. **Race conditions**: Components mounting after script init miss initial state
3. **Multiple subscription patterns**: Port messages, storage events, DataStore subscriptions, eventBus
4. **Character switching**: No unified character context for state reset
5. **Difficult testing**: State hidden in closures, hard to mock
6. **No time travel debugging**: Can't inspect or replay state changes

### Objectives

- ✅ Single source of truth for all script state (Zustand store)
- ✅ Scripts emit state changes, store manages state
- ✅ React components read from store, not event handlers
- ✅ Proper TypeScript types for all script state
- ✅ Easy to test, debug, and extend
- ✅ Character-scoped state with proper switching
- ✅ Backward compatible with existing eventBus (gradual migration)

### Proposed Architecture: Zustand-Based State Bridge

#### Why Zustand?

1. **Minimal boilerplate**: No providers, actions, or reducers needed
2. **Non-React compatible**: Scripts can access store directly (non-hook API)
3. **DevTools support**: Time-travel debugging with Redux DevTools
4. **Middleware ecosystem**: Persist, immer, subscribeWithSelector
5. **TypeScript-first**: Excellent type inference
6. **Small bundle**: ~1KB gzipped

#### State Store Architecture

**Location**: `src/ui/web/stores/gameState.ts`

```typescript
import { create } from 'zustand'
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'

// State interface with all script data
interface GameState {
  // Timer state (from combatTimer, coverTimer, lamp, etc.)
  timers: {
    combat: number | null
    cover: number | null
    lamp: number | null
    zask: { seconds: number; ok: boolean } | null
    transport: { label: string; seconds: number } | null
    order: number | null
  }

  // Character state (from GMCP)
  character: {
    name: string | null
    hp: number
    maxHp: number
    mana: number
    maxMana: number
    fatigue: number
    maxFatigue: number
    condition: number
    exp: number
    gold: number
    state: string | null  // Character state text
    colors: Record<string, string>
  }

  // Combat state (from GMCP objects)
  combat: {
    inCombat: boolean
    targets: Map<number, ObjectData>
    attackMode: 'A' | 'AW' | 'AWR'
    attackQueue: number[]
  }

  // Inventory state (from herbCounter)
  inventory: {
    herbs: Record<number, Record<string, number>>  // bagId -> herbId -> count
    loading: boolean
    lastUpdate: number | null
  }

  // Room state (from multibinds, enterLocation)
  room: {
    id: number | null
    multibinds: Array<{ label: string; command: string }>
  }

  // UI state
  ui: {
    packageStatus: { text: string; severity: number } | null
    breakItemWarning: { text: string; command?: string } | null
    releaseGuard: boolean
    moveMode: number
  }

  // Deposits (from deposits script)
  deposits: Record<string, unknown>

  // Knowledge (from knowledge script)
  knowledge: unknown

  // Actions (for scripts to call)
  actions: {
    updateTimer: (timer: keyof GameState['timers'], value: any) => void
    updateCharacter: (updates: Partial<GameState['character']>) => void
    updateCombat: (updates: Partial<GameState['combat']>) => void
    updateInventory: (updates: Partial<GameState['inventory']>) => void
    updateRoom: (updates: Partial<GameState['room']>) => void
    updateUI: (updates: Partial<GameState['ui']>) => void
    setDeposits: (deposits: Record<string, unknown>) => void
    setKnowledge: (knowledge: unknown) => void
    reset: () => void  // Called on character switch
  }
}

// Initial state
const initialState: Omit<GameState, 'actions'> = {
  timers: {
    combat: null,
    cover: null,
    lamp: null,
    zask: null,
    transport: null,
    order: null,
  },
  character: {
    name: null,
    hp: 0,
    maxHp: 0,
    mana: 0,
    maxMana: 0,
    fatigue: 0,
    maxFatigue: 0,
    condition: 0,
    exp: 0,
    gold: 0,
    state: null,
    colors: {},
  },
  combat: {
    inCombat: false,
    targets: new Map(),
    attackMode: 'A',
    attackQueue: [],
  },
  inventory: {
    herbs: {},
    loading: false,
    lastUpdate: null,
  },
  room: {
    id: null,
    multibinds: [],
  },
  ui: {
    packageStatus: null,
    breakItemWarning: null,
    releaseGuard: false,
    moveMode: 0,
  },
  deposits: {},
  knowledge: null,
}

// Create store with middleware
export const useGameState = create<GameState>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set) => ({
          ...initialState,
          actions: {
            updateTimer: (timer, value) =>
              set((state) => ({
                timers: { ...state.timers, [timer]: value }
              }), false, `timer/${timer}`),

            updateCharacter: (updates) =>
              set((state) => ({
                character: { ...state.character, ...updates }
              }), false, 'character/update'),

            updateCombat: (updates) =>
              set((state) => ({
                combat: { ...state.combat, ...updates }
              }), false, 'combat/update'),

            updateInventory: (updates) =>
              set((state) => ({
                inventory: { ...state.inventory, ...updates }
              }), false, 'inventory/update'),

            updateRoom: (updates) =>
              set((state) => ({
                room: { ...state.room, ...updates }
              }), false, 'room/update'),

            updateUI: (updates) =>
              set((state) => ({
                ui: { ...state.ui, ...updates }
              }), false, 'ui/update'),

            setDeposits: (deposits) =>
              set({ deposits }, false, 'deposits/set'),

            setKnowledge: (knowledge) =>
              set({ knowledge }, false, 'knowledge/set'),

            reset: () =>
              set(initialState, false, 'reset'),
          },
        }),
        {
          name: 'arkadia-game-state',
          // Only persist certain keys (not transient timers)
          partialize: (state) => ({
            deposits: state.deposits,
            knowledge: state.knowledge,
          }),
        }
      )
    ),
    { name: 'ArkadiaGameState' }
  )
)

// Non-React API for scripts
export const gameStateStore = useGameState
```

#### Script Integration Pattern

**Before (Event-Based)**:
```typescript
// coverTimer.ts - OLD
export default function initCoverTimer(client: Client) {
    let timer: number | null = null
    let end = 0

    function update() {
        const left = end - Date.now()
        if (left <= 0) {
            timer = null
            client.sendEvent('coverTimer', null)  // ❌ Event only
        } else {
            client.sendEvent('coverTimer', left / 1000)  // ❌ Event only
        }
    }
}
```

**After (Store-Based)**:
```typescript
// coverTimer.ts - NEW
import { gameStateStore } from '@web-ui/stores/gameState'

export default function initCoverTimer(client: Client) {
    let timer: number | null = null
    let end = 0
    const { updateTimer } = gameStateStore.getState().actions

    function update() {
        const left = end - Date.now()
        if (left <= 0) {
            timer = null
            updateTimer('cover', null)  // ✅ Store update
        } else {
            updateTimer('cover', left / 1000)  // ✅ Store update
        }
    }
}
```

**Backward Compatibility Bridge**:
```typescript
// src/client/scriptStateBridge.ts
import { gameStateStore } from '@web-ui/stores/gameState'

/**
 * Bridge that listens to Zustand store changes and emits eventBus events
 * for backward compatibility with legacy components
 */
export function initializeScriptStateBridge(client: Client) {
    const store = gameStateStore.getState()

    // Subscribe to timer changes and emit events
    gameStateStore.subscribe(
        (state) => state.timers.combat,
        (combat) => client.sendEvent('combatTimer', combat)
    )

    gameStateStore.subscribe(
        (state) => state.timers.cover,
        (cover) => client.sendEvent('coverTimer', cover)
    )

    gameStateStore.subscribe(
        (state) => state.timers.lamp,
        (lamp) => client.sendEvent('lampTimer', lamp)
    )

    // ... other timer bridges

    // Character state bridges
    gameStateStore.subscribe(
        (state) => state.character,
        (char) => {
            client.sendEvent('gmcp.char.vitals', {
                hp: char.hp,
                maxhp: char.maxHp,
                mana: char.mana,
                maxmana: char.maxMana,
            })
        }
    )

    // Combat bridges
    gameStateStore.subscribe(
        (state) => state.combat.attackMode,
        (mode) => client.sendEvent('attackMode', mode)
    )

    // ... etc
}
```

#### React Component Usage

**Before (useClientEvent)**:
```typescript
// CombatTimer.tsx - OLD
export const CombatTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null)

  useClientEvent<number | null>("combatTimer", (newSeconds) => {
    setSeconds(newSeconds)  // ❌ Local state, can miss initial value
  })

  return seconds != null
    ? <span style={{color: getColor(seconds)}}>Walka: {seconds}</span>
    : null
}
```

**After (Zustand)**:
```typescript
// CombatTimer.tsx - NEW
import { useGameState } from '@web-ui/stores/gameState'

export const CombatTimer: React.FC = () => {
  const seconds = useGameState(state => state.timers.combat)  // ✅ Always has current value

  return seconds != null
    ? <span style={{color: getColor(seconds)}}>Walka: {seconds}</span>
    : null
}
```

**Benefits**:
- ✅ No local state needed
- ✅ Always has current value (no race conditions)
- ✅ Automatic re-render on changes
- ✅ Easy to test (just check store state)
- ✅ Can use selectors for derived state

#### Character Switching Pattern

**Problem**: When character changes, all character-scoped state must reset.

**Solution**: Character context + reset action

```typescript
// src/ui/web/contexts/CharacterContext.tsx
import { createContext, useContext, useEffect } from 'react'
import { useGameState } from '@web-ui/stores/gameState'

interface CharacterContextValue {
  characterName: string | null
  switchCharacter: (name: string) => void
}

const CharacterContext = createContext<CharacterContextValue | null>(null)

export function CharacterProvider({ children }: { children: React.ReactNode }) {
  const characterName = useGameState(state => state.character.name)
  const { reset, updateCharacter } = useGameState(state => state.actions)

  const switchCharacter = (name: string) => {
    // Reset all state
    reset()

    // Set new character
    updateCharacter({ name })

    // Notify scripts (optional, for migration)
    // client.sendEvent('character-changed', name)
  }

  useEffect(() => {
    // Listen for character changes from server
    const handleGMCPCharInfo = (info: any) => {
      if (info.name !== characterName) {
        switchCharacter(info.name)
      }
    }

    // Subscribe to GMCP character info
    // client.on('gmcp.char.info', handleGMCPCharInfo)

    return () => {
      // Cleanup
    }
  }, [characterName])

  return (
    <CharacterContext.Provider value={{ characterName, switchCharacter }}>
      {children}
    </CharacterContext.Provider>
  )
}

export const useCharacter = () => {
  const context = useContext(CharacterContext)
  if (!context) throw new Error('useCharacter must be used within CharacterProvider')
  return context
}
```

#### Storage Integration Pattern

**Problem**: Scripts use localStorage for persistence, but Zustand has its own persist middleware.

**Solution**: Hybrid approach - Zustand for UI state, storage for script-only data

```typescript
// For character-scoped data that needs cross-tab sync:
// Keep using existing storage + DataStore pattern

// For UI-related state:
// Use Zustand persist middleware

// Bridge pattern for backward compatibility:
export function initializeStorageBridge(client: Client) {
  const { setDeposits, setKnowledge } = gameStateStore.getState().actions

  // Listen to storage events and update Zustand
  client.on('storage', ({ key, value }) => {
    switch (key) {
      case 'deposits':
        setDeposits(value)
        break
      case 'knowledge':
        setKnowledge(value)
        break
      // ... other keys
    }
  })

  // Listen to Zustand changes and save to storage
  gameStateStore.subscribe(
    (state) => state.deposits,
    (deposits) => {
      storage.setItem('deposits', deposits)
    }
  )

  gameStateStore.subscribe(
    (state) => state.knowledge,
    (knowledge) => {
      storage.setItem('knowledge', knowledge)
    }
  )
}
```

### Tasks

#### 1.5.1 Create Zustand Store Structure

```bash
# Install Zustand
yarn add zustand

# Create store files
mkdir -p src/ui/web/stores
touch src/ui/web/stores/gameState.ts
touch src/ui/web/stores/slices/timersSlice.ts
touch src/ui/web/stores/slices/characterSlice.ts
touch src/ui/web/stores/slices/combatSlice.ts
```

#### 1.5.2 Define State Interfaces

Create comprehensive TypeScript interfaces for all script state in `gameState.ts`.

#### 1.5.3 Implement Store with Actions

Implement the Zustand store with:
- Initial state for all script data
- Actions for updating each slice
- DevTools middleware for debugging
- Persist middleware for selected keys
- SubscribeWithSelector for efficient subscriptions

#### 1.5.4 Create Script State Bridge

Create `src/client/scriptStateBridge.ts`:
- Subscribe to Zustand store changes
- Emit legacy eventBus events for backward compatibility
- Allow gradual migration of components

#### 1.5.5 Create Storage Bridge

Create `src/client/storageBridge.ts`:
- Sync storage events → Zustand store
- Sync Zustand store → storage
- Handle character-scoped keys

#### 1.5.6 Update Script Integration

Update 3-5 example scripts to use store directly:
- `coverTimer.ts` - Simple timer
- `combatTimer.ts` - Simple timer
- `herbCounter.ts` - Complex state
- `multibinds.ts` - Database state
- `deposits.ts` - Storage state

Pattern:
```typescript
import { gameStateStore } from '@web-ui/stores/gameState'

const { updateTimer } = gameStateStore.getState().actions
updateTimer('cover', value)
```

#### 1.5.7 Create Character Context

Implement `CharacterContext.tsx` for character switching.

#### 1.5.8 Update React Components

Update 3-5 example components to use Zustand:
- `CombatTimer.tsx`
- `CoverTimer.tsx`
- `CharState.tsx`
- `CharStateInfo.tsx`

Replace `useClientEvent()` with Zustand selectors.

#### 1.5.9 Test State Synchronization

Verify:
- Scripts update store correctly
- Components re-render on state changes
- Storage persistence works
- Character switching resets state
- DevTools show state history
- No memory leaks from subscriptions

#### 1.5.10 Document Patterns

Create `docs/SCRIPT_STATE_PATTERNS.md`:
- How to add new script state
- How to update existing scripts
- How to use state in React components
- How to handle character-scoped data
- How to debug state issues
- Migration guide from eventBus to Zustand

### Success Criteria

- ✅ Zustand store managing all script state
- ✅ 5+ scripts updated to use store
- ✅ 5+ components updated to use store
- ✅ Backward compatibility bridge working (legacy components still work)
- ✅ Character switching properly resets state
- ✅ Storage sync working for persisted data
- ✅ DevTools show complete state history
- ✅ All tests passing
- ✅ Documentation complete

### Benefits

1. **Single Source of Truth**: All state in one place, easy to inspect
2. **No Race Conditions**: Components always have current state
3. **Better Testing**: Mock store instead of complex event/storage setup
4. **Time Travel Debugging**: Redux DevTools support
5. **Type Safety**: Full TypeScript support with inference
6. **Performance**: Efficient subscriptions, only re-render what changed
7. **Gradual Migration**: Backward compatible bridge allows incremental updates
8. **Developer Experience**: Clear patterns, easy to extend

### Migration Strategy

**Phase 1** (this phase): Foundation
- Create store structure
- Update 5 example scripts
- Update 5 example components
- Create bridges for backward compatibility
- **Run E2E tests** to verify no regressions

**Phase 2** (future): Gradual Migration
- Update remaining scripts one by one
- Update remaining components one by one
- Remove backward compatibility bridge when done

**Phase 3** (future): Optimization
- Remove eventBus for script state (keep for system events)
- Optimize store structure based on usage patterns
- Add computed/derived state as needed

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

#### 2.1 Consolidate DataStores

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

4. Run tests (both unit and E2E)

**Files to update**:
- `src/client/PackageHelper.ts`
- `src/client/scripts/multibinds.ts`
- `src/web/main.ts`
- Any other files importing from `@web/dataStores/*`

#### 2.2 Remove MockPort Abstraction

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

7. Run tests (both unit and E2E)

**Files to update**:
- `src/client/Client.ts` (constructor, connect method, port usage)
- `src/web/main.ts` (Client instantiation)
- All test files that mock port (use storage mocks instead)

**Benefits**:
- ~50 lines of unnecessary abstraction removed
- Clearer code - direct storage access instead of message passing
- Easier to test - mock storage instead of port
- One less file to maintain

#### 2.3 Verify Dependency Flow

After Phase 2.1 and 2.2, verify no circular dependencies:

```bash
# Check client doesn't import from web
grep -r "@web" src/client/

# Should return: NO MATCHES
```

### Success Criteria
- ✅ No imports from `@web` in `src/client/`
- ✅ All dataStores in one location (`src/modules/data/dataStores/`)
- ✅ MockPort removed, direct storage usage
- ✅ All unit tests passing
- ✅ All E2E tests passing (critical for verifying integration)
- ✅ Clean dependency hierarchy (no circular dependencies)

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
- ✅ All unit tests passing
- ✅ All E2E tests passing

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
- ✅ All unit tests passing
- ✅ All E2E tests passing
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
- ✅ All unit tests passing
- ✅ All E2E tests passing (critical - verifies initialization flow works)
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
- ✅ All unit tests passing
- ✅ All E2E tests passing

---

## Phase 6.5: Remove Script State Backward Compatibility Bridge

**Priority**: Medium
**Estimated Effort**: 2-3 hours
**Dependencies**: Phase 1.5, Phase 6 (all scripts and components migrated)
**When to Execute**: After all scripts and components have been migrated to use Zustand store

### Background

In Phase 1.5, we created a backward compatibility bridge (`scriptStateBridge.ts`) that:
- Listens to Zustand store changes
- Emits legacy eventBus events
- Allows gradual migration of scripts and components

Once all scripts and components have been migrated to use the Zustand store directly, this bridge becomes unnecessary overhead and should be removed.

### Objectives

- ✅ Remove backward compatibility bridge
- ✅ Remove legacy `useClientEvent()` patterns for state (keep for system events)
- ✅ Verify all scripts use store directly
- ✅ Verify all components use store directly
- ✅ Clean up eventBus event types for state (keep system events)
- ✅ Reduce bundle size and improve performance

### Prerequisites Checklist

Before executing this phase, verify that:

**Scripts Migration (from Phase 1.5)**:
- [ ] All timer scripts updated (combat, cover, lamp, zask, transport, order)
- [ ] `herbCounter.ts` updated to use store
- [ ] `multibinds.ts` updated to use store
- [ ] `deposits.ts` updated to use store
- [ ] `knowledge.ts` updated to use store
- [ ] All other scripts using `client.sendEvent()` for state migrated
- [ ] No scripts emit state events (only system events)

**Component Migration (from Phase 1)**:
- [ ] All timer components using Zustand
- [ ] CharState components using Zustand
- [ ] All panels using Zustand
- [ ] No components use `useClientEvent()` for state (only system events)

### Tasks

#### 6.5.1 Audit Script State Events

Create audit script to find remaining state event emissions:

```bash
# Find scripts still emitting state events
grep -rn "sendEvent.*Timer" src/client/scripts/
grep -rn "sendEvent.*herbCounts" src/client/scripts/
grep -rn "sendEvent.*multibinds" src/client/scripts/
grep -rn "sendEvent.*deposits" src/client/scripts/
grep -rn "sendEvent.*packageStatus" src/client/scripts/
grep -rn "sendEvent.*breakItem" src/client/scripts/
grep -rn "sendEvent.*attackMode" src/client/scripts/
grep -rn "sendEvent.*releaseGuard" src/client/scripts/

# Should return: NO MATCHES (or only system events)
```

If any matches found, migrate those scripts first.

#### 6.5.2 Audit Component State Subscriptions

Find components still using `useClientEvent()` for state:

```bash
# Find components using useClientEvent for state
grep -rn "useClientEvent.*Timer" src/ui/
grep -rn "useClientEvent.*herbCounts" src/ui/
grep -rn "useClientEvent.*multibinds" src/ui/
grep -rn "useClientEvent.*packageStatus" src/ui/
grep -rn "useClientEvent.*breakItem" src/ui/
grep -rn "useClientEvent.*attackMode" src/ui/

# Should return: NO MATCHES (or only system events)
```

If any matches found, migrate those components first.

#### 6.5.3 Remove Script State Bridge

Delete the backward compatibility bridge:

```bash
rm src/client/scriptStateBridge.ts
```

Remove initialization call from main application:

```typescript
// src/web/main.ts or initialization file - REMOVE:
import { initializeScriptStateBridge } from '@client/scriptStateBridge';
initializeScriptStateBridge(client);
```

#### 6.5.4 Clean Up Event Type Definitions

Update `src/shared/events/clientEvents.ts` to remove state events:

**Remove state event types** (keep system events):
```typescript
// REMOVE - Now handled by Zustand store:
"combatTimer": number | null;
"coverTimer": number | null;
"lampTimer": number | null;
"zaskTimer": { seconds: number; ok: boolean } | null;
"orderTimer": number | null;
"transportTimer": TransportTimerPayload | null;
"herbCounts": unknown;
"multibinds": MultibindList;
"packageStatus": PackageStatus | null;
"breakItem": { text: string; command?: string } | null;
"attackMode": "A" | "AW" | "AWR";
"releaseGuard": boolean;
"moveMode": number;

// KEEP - System events still needed:
"gmcp.char.info": any;
"gmcp.char.state": any;
"gmcp.char.colors": any;
"gmcp.objects.data": Map<number, ObjectData>;
"gmcp.room.info": any;
"enterLocation": { id: number; room: unknown };
"client.disconnect": void;
"reset": void;
"storage": StorageEventPayload;
"settings": unknown;
"binds": unknown;
"uiSettings": UiSettingsEventPayload;
"kill": { killer: "ME" | "TEAM" | "OTHER" };
"knowledgeReport": unknown;
"attackQueueChange": number[];
```

#### 6.5.5 Update useClientEvent Hook Documentation

Update `src/ui/web/hooks/useClientEvent.ts` documentation:

```typescript
/**
 * Hook to subscribe to client events.
 *
 * NOTE: This hook should ONLY be used for system events (GMCP, connection, etc.),
 * NOT for state events. Use the Zustand store (useGameState) for state subscriptions.
 *
 * System events include:
 * - GMCP events (gmcp.char.info, gmcp.objects.data, etc.)
 * - Connection events (client.disconnect, reset)
 * - Storage events (storage, settings, binds)
 * - Kill events, knowledge reports, etc.
 *
 * For game state (timers, character stats, combat, inventory, etc.),
 * use: const data = useGameState(state => state.path.to.data)
 *
 * @example
 * // ✅ CORRECT - System event
 * useClientEvent("gmcp.char.info", (info) => {
 *   console.log("Character loaded:", info.name);
 * });
 *
 * // ❌ INCORRECT - State event (use Zustand instead)
 * useClientEvent("combatTimer", setSeconds);
 *
 * // ✅ CORRECT - State subscription
 * const seconds = useGameState(state => state.timers.combat);
 */
export function useClientEvent<T>(
  event: keyof ClientEvents,
  handler: (data: T) => void,
  options?: { once?: boolean }
): void {
  // ... implementation
}
```

#### 6.5.6 Remove Storage Bridge (Optional)

If `storageBridge.ts` was created in Phase 1.5 and all storage is now handled by Zustand persist middleware:

Evaluate if storage bridge is still needed:
- **Keep** if character-scoped storage still needs cross-tab sync
- **Remove** if all state is in Zustand with persist middleware

```bash
# If removing:
rm src/client/storageBridge.ts

# Remove initialization:
# Delete initializeStorageBridge(client) call from main
```

**Recommendation**: Keep storage bridge if using character-scoped localStorage. Only remove if fully migrated to Zustand persistence.

#### 6.5.7 Run Full Test Suite

Verify nothing broke:

```bash
yarn test
yarn test:e2e
yarn build
```

#### 6.5.8 Test State Synchronization

Manual testing checklist:

**Timers**:
- [ ] Combat timer appears and counts down correctly
- [ ] Cover timer shows remaining seconds
- [ ] Lamp timer displays correctly
- [ ] All timers clear when timer ends

**Character State**:
- [ ] HP/Mana bars update correctly
- [ ] Character state text updates
- [ ] Colors apply correctly

**Combat**:
- [ ] Target list updates
- [ ] Attack mode changes work
- [ ] Attack queue updates

**Inventory**:
- [ ] Herb counts update correctly
- [ ] Bag selection works

**Room State**:
- [ ] Multibinds update on room change
- [ ] Keybinds execute correctly

**UI State**:
- [ ] Package status displays
- [ ] Break item warnings show
- [ ] Release guard toggles

**Character Switching**:
- [ ] State resets on character change
- [ ] New character data loads correctly

#### 6.5.9 Performance Verification

Compare before/after metrics:

```typescript
// Add to App.tsx temporarily
useEffect(() => {
  console.log("Store subscriptions:", Object.keys(useGameState.getState()));
  console.log("EventBus listeners:", /* count eventBus listeners */);
}, []);
```

Expected improvements:
- Fewer eventBus listeners (only system events)
- Faster state updates (no bridge overhead)
- Smaller bundle size (~2-3KB from removed bridge)

#### 6.5.10 Update Documentation

Update `docs/SCRIPT_STATE_PATTERNS.md`:
- Remove backward compatibility section
- Update migration guide to reflect completion
- Mark bridge removal as complete
- Add note about eventBus usage (system events only)

### Success Criteria

- ✅ `scriptStateBridge.ts` deleted
- ✅ `storageBridge.ts` evaluated (removed or kept with justification)
- ✅ No scripts emit state events (only system events)
- ✅ No components use `useClientEvent()` for state
- ✅ Event type definitions cleaned (state events removed)
- ✅ All tests passing
- ✅ Manual testing confirms all features work
- ✅ Performance metrics show improvement
- ✅ Documentation updated

### Rollback Plan

If issues are discovered:

1. **Restore bridge files from git**:
   ```bash
   git checkout HEAD -- src/client/scriptStateBridge.ts
   git checkout HEAD -- src/client/storageBridge.ts
   ```

2. **Restore initialization**:
   ```typescript
   import { initializeScriptStateBridge } from '@client/scriptStateBridge';
   initializeScriptStateBridge(client);
   ```

3. **Restore event type definitions**:
   ```bash
   git checkout HEAD -- src/shared/events/clientEvents.ts
   ```

4. **Identify and fix missing migrations**:
   - Find scripts/components that weren't properly migrated
   - Complete migration
   - Retry phase 6.5

### Benefits

1. **Cleaner Architecture**: Single state management pattern (Zustand only)
2. **Better Performance**: No bridge overhead, direct store updates
3. **Smaller Bundle**: Remove ~2-3KB of bridge code
4. **Less Confusion**: Clear pattern - Zustand for state, eventBus for system events
5. **Easier Maintenance**: One less abstraction layer to understand
6. **Better Types**: TypeScript can infer state structure from store

---

## Phase 6.6: Unify Event Handling Architecture

**Priority**: Medium
**Estimated Effort**: 3-4 hours
**Dependencies**: Phase 6.5 (after bridge removal)
**When to Execute**: After state events migrated to Zustand, only system events remain

### Background

The codebase currently has **three overlapping event systems**:

1. **EventBus** (`src/modules/core/eventBus.ts`) - The core event emitter
2. **Client wrapper** (`src/client/Client.ts`) - Provides `client.on()`, `client.sendEvent()`
3. **ArkadiaClient wrapper** (`src/web/ArkadiaClient.ts`) - Provides `arkadiaClient.on()`, `arkadiaClient.emit()`

**All three delegate to the same EventBus instance** - Client and ArkadiaClient are pure pass-through wrappers with no added functionality.

### Current Redundant Delegation Chain

```
Script calls client.sendEvent('event', data)
    ↓
Client.sendEvent() → eventBus.emit('event', data)
    ↓
eventBus broadcasts to all listeners
    ↓
Script listening via client.on('event', handler)
    ↓
Client.on() → eventBus.on('event', handler)
```

**Problem**: Two unnecessary wrapper layers that provide no value.

### Analysis

**EventBus** (Core - Keep):
- Type-safe generic event emitter
- Listener deduplication
- One-time listeners (`once` option)
- AbortSignal support
- Returns unsubscribe function
- Returns invocation count from `emit()`
- **This is the actual event system**

**Client wrapper** (Pass-through - Remove):
```typescript
// Lines 300-310 in Client.ts
on<K extends EventKey>(event: K, listener: ClientEventListener<K>, options?: ListenerOptions): () => void {
    return eventBus.on(event, listener, options);  // Just passes through
}

sendEvent(type: string, ...args: unknown[]): void {
    eventBus.emit(type as EventKey, ...args);  // Just passes through
}
```
- **No added functionality**
- **No isolation or encapsulation**
- **Just creates another API surface**

**ArkadiaClient wrapper** (Pass-through - Remove):
```typescript
// Lines 82-98 in ArkadiaClient.ts
on<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
    eventBus.on(event, listener);  // Just passes through
}

emit<K extends keyof ClientEvents>(event: K, ...args: Params<ClientEvents[K]>): void {
    eventBus.emit(event, ...args);  // Just passes through
}
```
- **No added functionality**
- **Duplicates Client's wrapper**

**useClientEvent** (React Integration - Keep):
```typescript
export function useClientEvent<T>(event: keyof ClientEvents, handler: (data: T) => void): void {
  useEffect(() => {
    const unsubscribe = eventBus.on(event, handler);  // Uses eventBus directly
    return () => unsubscribe();
  }, deps);
}
```
- **Provides real value**: React lifecycle integration
- **Already uses eventBus directly** (not via wrappers)

### Objectives

- ✅ Single event system (EventBus only)
- ✅ Remove redundant Client.on/sendEvent wrappers
- ✅ Remove redundant ArkadiaClient.on/emit wrappers
- ✅ Scripts and React components use eventBus directly
- ✅ Clear, consistent event handling pattern
- ✅ Reduced API surface area

### Proposed Architecture

#### **After Unification:**

```
                  EventBus (Core)
                       ↓
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
    Scripts      React Components   System
  (direct use)   (via useClientEvent) (WebSocket, etc.)
```

**Scripts:**
```typescript
// OLD:
client.on('gmcp.char.info', handler);
client.sendEvent('lampTimer', 300);

// NEW:
import eventBus from '@modules/core/eventBus';
eventBus.on('gmcp.char.info', handler);
eventBus.emit('lampTimer', 300);
```

**React Components:**
```typescript
// NO CHANGE - already correct:
useClientEvent('lampTimer', handleTimer);
```

**System Events (ArkadiaClient):**
```typescript
// OLD:
this.emit('gmcp.char.info', data);

// NEW:
import eventBus from '@modules/core/eventBus';
eventBus.emit('gmcp.char.info', data);
```

### Tasks

#### 6.6.1 Audit Current Event Usage

Find all uses of Client and ArkadiaClient event methods:

```bash
# Find Client.on() usage
grep -rn "client\.on(" src/client/scripts/
grep -rn "client\.on(" src/

# Find Client.sendEvent() usage
grep -rn "client\.sendEvent(" src/client/scripts/
grep -rn "client\.sendEvent(" src/

# Find ArkadiaClient.emit() usage
grep -rn "this\.emit(" src/web/ArkadiaClient.ts

# Find ArkadiaClient.on() usage
grep -rn "arkadiaClient\.on(" src/
grep -rn "this\.on(" src/web/ArkadiaClient.ts
```

Create a migration checklist of all files that need updating.

#### 6.6.2 Create Event Helper Module

Create `src/client/events.ts` as a centralized import point:

```typescript
/**
 * Centralized event system for Arkadia.
 *
 * System events are handled via EventBus.
 * Game state is handled via Zustand store (see @web-ui/stores/gameState).
 *
 * System events include:
 * - GMCP events (gmcp.char.info, gmcp.objects.data, etc.)
 * - Connection events (client.connect, client.disconnect)
 * - Storage events (storage, settings, binds)
 * - Kill events, knowledge reports, etc.
 *
 * @example
 * // Listen to GMCP character info
 * eventBus.on('gmcp.char.info', (info) => {
 *   console.log('Character loaded:', info.name);
 * });
 *
 * @example
 * // Emit a system event
 * eventBus.emit('client.disconnect');
 *
 * @example
 * // In React components, use the hook instead:
 * import { useClientEvent } from '@web-ui/hooks/useClientEvent';
 * useClientEvent('gmcp.char.info', (info) => {
 *   console.log('Character loaded:', info.name);
 * });
 */
export { default as eventBus } from '@modules/core/eventBus';
export type { ClientEvents } from '@shared/events/clientEvents';
```

This provides:
- Single import point for scripts
- Documentation about when to use events vs Zustand
- Type exports for TypeScript support

#### 6.6.3 Update Scripts to Use EventBus Directly

**Migration Pattern:**

```typescript
// OLD:
export default function initLamp(client: Client) {
    function processCounter() {
        client.sendEvent('lampTimer', seconds);
    }

    client.on('gmcp.char.info', (info) => {
        // handle
    });
}

// NEW:
import { eventBus } from '@client/events';

export default function initLamp() {  // Note: No client parameter needed
    function processCounter() {
        eventBus.emit('lampTimer', seconds);
    }

    eventBus.on('gmcp.char.info', (info) => {
        // handle
    });
}
```

**Scripts to update** (based on exploration):
- `src/client/scripts/lamp.ts`
- `src/client/scripts/clock.ts`
- `src/client/scripts/coverTimer.ts`
- `src/client/scripts/combatTimer.ts`
- `src/client/scripts/zaskTimer.ts`
- `src/client/scripts/transportTimer.ts`
- All 90+ scripts in `src/client/scripts/`

**Note**: Scripts may still need Client for other functionality (triggers, aliases, sendCommand). Keep Client parameter if needed for non-event functionality.

#### 6.6.4 Update ArkadiaClient to Use EventBus Directly

Update `src/web/ArkadiaClient.ts`:

**Remove wrapper methods** (Lines 82-98):
```typescript
// DELETE:
on<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
    eventBus.on(event, listener);
}

off<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
    eventBus.off(event, listener);
}

emit<K extends keyof ClientEvents>(event: K, ...args: Params<ClientEvents[K]>): void {
    eventBus.emit(event, ...args);
}
```

**Update internal usage**:
```typescript
// OLD:
this.emit('gmcp.char.info', data);
this.on('uiSettings', handler);

// NEW:
import eventBus from '@modules/core/eventBus';
eventBus.emit('gmcp.char.info', data);
eventBus.on('uiSettings', handler);
```

**Files to update in ArkadiaClient**:
- Constructor listener (Line 71-75)
- WebSocket event handlers (Lines 124-140)
- GMCP processing (Lines 44-61)
- Recorder event handling (Lines 425-436)

#### 6.6.5 Update Client Class

**Option A: Remove Event Wrapper Methods** (Recommended)

Remove from `src/client/Client.ts` (Lines 300-310, 475-478):
```typescript
// DELETE:
on<K extends EventKey>(...) { return eventBus.on(...); }
off<K extends EventKey>(...) { eventBus.off(...); }
emit<K extends EventKey>(...) { eventBus.emit(...); }
sendEvent(...) { eventBus.emit(...); }
```

**Update Client's internal event listeners**:
```typescript
// OLD:
this.on('settings', handler);
this.on('gmcp.char.info', handler);

// NEW:
import eventBus from '@modules/core/eventBus';
eventBus.on('settings', handler);
eventBus.on('gmcp.char.info', handler);
```

**Option B: Keep Convenience Methods for Client-Specific Events** (Alternative)

If Client manages its own lifecycle events, keep methods but document clearly:

```typescript
/**
 * Subscribe to client system events.
 *
 * @deprecated Use eventBus directly for system events.
 * This method is kept for backward compatibility only.
 *
 * @example
 * // Preferred:
 * import { eventBus } from '@client/events';
 * eventBus.on('gmcp.char.info', handler);
 */
on<K extends EventKey>(event: K, listener: ClientEventListener<K>, options?: ListenerOptions): () => void {
    return eventBus.on(event, listener, options);
}
```

**Recommendation**: Option A (complete removal) for cleaner architecture.

#### 6.6.6 Update Script Initialization

Update `src/client/main.ts` to not require Client for event registration:

**OLD:**
```typescript
export function registerScripts(client: Client) {
    initLamp(client);
    initClock(client);
    initCoverTimer(client);
    // ... 90+ scripts
}
```

**NEW:**
```typescript
export function registerScripts(client: Client) {
    // Scripts that need Client for triggers/aliases/sendCommand
    initLamp(client);
    initClock(client);

    // Scripts that only use events can work without Client
    // (but keep Client param for consistency if desired)
}
```

Or if removing event methods entirely from Client, scripts can import eventBus directly and only receive Client when they need triggers/aliases.

#### 6.6.7 Update Component Event Subscriptions

Verify all React components use `useClientEvent` hook (not direct eventBus):

```bash
# Find direct eventBus usage in components
grep -rn "eventBus\.on(" src/ui/
grep -rn "eventBus\.emit(" src/ui/

# Should only be useClientEvent
grep -rn "useClientEvent(" src/ui/
```

**If direct eventBus usage found**, migrate to `useClientEvent`:

```typescript
// BAD - direct eventBus usage in component:
useEffect(() => {
    const unsubscribe = eventBus.on('lampTimer', handler);
    return unsubscribe;
}, []);

// GOOD - use hook:
useClientEvent('lampTimer', handler);
```

#### 6.6.8 Remove Type Aliases

Remove redundant type aliases from Client.ts (Lines 20-27):

```typescript
// DELETE - use ClientEvents directly:
type EventKey = keyof ClientEvents;
type EventParams<K extends EventKey> = ...;
type ClientEventListener<K extends EventKey> = ...;
type ListenerOptions = ...;
```

Update all usages to use ClientEvents and eventBus types directly.

#### 6.6.9 Update Documentation

**Update `Client.ts` JSDoc**:
```typescript
/**
 * Main game client class.
 *
 * Handles connection to game server, processes game state, and manages triggers.
 *
 * For event handling, use eventBus directly:
 * @see {@link eventBus} from '@modules/core/eventBus'
 *
 * @example
 * import { eventBus } from '@client/events';
 *
 * eventBus.on('gmcp.char.info', (info) => {
 *   console.log('Character:', info.name);
 * });
 */
export default class Client {
  // ... implementation
}
```

**Update README.md** with event handling guide:
```markdown
## Event Handling

### For Scripts
Use eventBus directly for system events:

\`\`\`typescript
import { eventBus } from '@client/events';

// Listen to events
eventBus.on('gmcp.char.info', (info) => {
  console.log('Character:', info.name);
});

// Emit events
eventBus.emit('client.disconnect');
\`\`\`

### For React Components
Use the useClientEvent hook:

\`\`\`typescript
import { useClientEvent } from '@web-ui/hooks/useClientEvent';

function MyComponent() {
  useClientEvent('gmcp.char.info', (info) => {
    console.log('Character:', info.name);
  });
}
\`\`\`

### For Game State
Use Zustand store, not events:

\`\`\`typescript
import { useGameState } from '@web-ui/stores/gameState';

function TimerComponent() {
  const lampTime = useGameState(state => state.timers.lamp);
  // ...
}
\`\`\`
```

**Create `docs/architecture/EVENT_SYSTEM.md`**:
```markdown
# Event System Architecture

## Overview

Arkadia uses a single, centralized event system based on EventBus.

## EventBus

**Location**: `src/modules/core/eventBus.ts`

The core event emitter that all events flow through.

### Features
- Type-safe with `ClientEvents` interface
- Listener deduplication
- One-time listeners (`once` option)
- AbortSignal support for cancellation
- Returns unsubscribe function
- Returns invocation count

### Usage

**In Scripts**:
\`\`\`typescript
import { eventBus } from '@client/events';

// Subscribe
const unsubscribe = eventBus.on('gmcp.char.info', (info) => {
  console.log('Character:', info.name);
});

// Emit
eventBus.emit('client.disconnect');

// Unsubscribe
unsubscribe();
\`\`\`

**In React Components**:
\`\`\`typescript
import { useClientEvent } from '@web-ui/hooks/useClientEvent';

function MyComponent() {
  useClientEvent('gmcp.char.info', (info) => {
    console.log('Character:', info.name);
  });
}
\`\`\`

## Event Types

**System Events** (use EventBus):
- GMCP events: `gmcp.char.info`, `gmcp.objects.data`, etc.
- Connection: `client.connect`, `client.disconnect`, `reset`
- Storage: `storage`, `settings`, `binds`, `uiSettings`
- Game events: `kill`, `knowledgeReport`, `enterLocation`

**State Events** (use Zustand store, NOT events):
- Timers: `timers.combat`, `timers.lamp`, `timers.cover`, etc.
- Character: `character.hp`, `character.mana`, etc.
- Combat: `combat.targets`, `combat.attackMode`, etc.
- Inventory: `inventory.herbs`
- UI state: `ui.packageStatus`, `ui.breakItemWarning`

## Migration from Wrappers

Previously, events were handled through Client and ArkadiaClient wrappers:

\`\`\`typescript
// OLD:
client.on('gmcp.char.info', handler);
client.sendEvent('lampTimer', value);
arkadiaClient.emit('event', data);

// NEW:
eventBus.on('gmcp.char.info', handler);
eventBus.emit('lampTimer', value);
eventBus.emit('event', data);
\`\`\`

These wrappers were removed in Phase 6.6 as they provided no added value.
```

#### 6.6.10 Run Tests and Verification

```bash
yarn test
yarn test:e2e
yarn build
```

**Manual verification**:
- [ ] GMCP events still trigger correctly (character info, room info)
- [ ] WebSocket connection events work (connect, disconnect)
- [ ] Storage events trigger correctly
- [ ] Scripts can communicate via events
- [ ] React components receive events
- [ ] No console errors about undefined event methods

### Success Criteria

- ✅ Client.on/sendEvent methods removed (or deprecated)
- ✅ ArkadiaClient.on/emit methods removed
- ✅ All scripts use eventBus directly (or via centralized import)
- ✅ All React components use useClientEvent hook
- ✅ No direct eventBus.on() in React components
- ✅ Centralized event documentation created
- ✅ All tests passing
- ✅ Build successful
- ✅ No runtime errors

### Benefits

1. **Single Event System**: One clear pattern for all event handling
2. **Reduced API Surface**: Fewer methods to learn and maintain
3. **Less Confusion**: No more "should I use client.on or eventBus.on?"
4. **Better Documentation**: Single source of truth for event docs
5. **Easier Testing**: Mock eventBus instead of Client/ArkadiaClient
6. **Cleaner Architecture**: Removed two unnecessary abstraction layers
7. **Better Type Inference**: Direct use of eventBus types

### Migration Estimate

- **Scripts migration**: 1-2 hours (find/replace across 90+ files)
- **ArkadiaClient cleanup**: 30 minutes
- **Client cleanup**: 30 minutes
- **Documentation**: 1 hour
- **Testing**: 1 hour

**Total**: 3-4 hours

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

### Sprint 1 (Week 1-2)
- ✅ **Phase 1: Complete React Migration** (11-16 hours) - **EXPANDED SCOPE**
  - Phase 1a: Delete duplicates, verify React versions (2-3 hours)
  - Phase 1b: Create React islands (Terminal, Map) (3-4 hours)
  - Phase 1.5: **Script-React State Integration** (3-4 hours) - **NEW**
  - Phase 1c: Migrate complex components (ObjectList, Mobile UI) (2-3 hours)
  - Phase 1d: Set up state management, App root, refactor main.ts (2-3 hours)
  - Phase 1e: Testing and cleanup (1-2 hours)

### Sprint 2 (Week 3)
- ✅ **Phase 2: Break Circular Dependencies** (3-5 hours)
  - Phase 2.1: Consolidate DataStores
  - Phase 2.2: Remove MockPort abstraction
  - Phase 2.3: Verify dependency flow

### Sprint 3 (Week 3)
- ✅ **Phase 3: Consolidate Type Definitions** (2-3 hours)
- ✅ **Phase 4: Reorganize Web Directory** (3-4 hours)

### Sprint 4 (Week 4)
- ✅ **Phase 5: Refactor main.ts** (2-3 hours) - **REDUCED** (most work moved to Phase 1)
- ✅ **Phase 6: Documentation & Cleanup** (2-3 hours)

### Sprint 5 (Week 5+) - After All Scripts/Components Migrated
- ✅ **Phase 6.5: Remove Backward Compatibility Bridge** (2-3 hours)
  - Audit all scripts for state event emissions
  - Audit all components for useClientEvent usage
  - Remove scriptStateBridge.ts
  - Clean up event type definitions
  - Performance verification
- ✅ **Phase 6.6: Unify Event Handling Architecture** (3-4 hours)
  - Remove Client.on/sendEvent wrappers
  - Remove ArkadiaClient.on/emit wrappers
  - Update all scripts to use eventBus directly
  - Create centralized event documentation
  - Verify React components use useClientEvent hook
- ✅ Final testing and validation

### Optional (Future)
- Phase 7: Optional enhancements as needed

**Total Estimated Effort**: 28-41 hours (increased from original 16-23 hours due to complete React migration + script-React state integration + bridge removal + event unification)

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
- [ ] src/web/dataStores/mapStore.ts → src/modules/data/dataStores/mapStore.ts (Phase 2.1)
- [ ] src/web/dataStores/multibindStore.ts → src/modules/data/dataStores/multibindStore.ts (Phase 2.1)
- [ ] src/web/dataStores/npcStore.ts → src/modules/data/dataStores/npcStore.ts (Phase 2.1)
- [ ] Delete src/web/MockPort.ts (Phase 2.2)

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

### Phase 6.5: Delete (After All Scripts/Components Migrated)
- [ ] Delete src/client/scriptStateBridge.ts
- [ ] Delete src/client/storageBridge.ts (evaluate first - may need to keep)
- [ ] Clean up state event types from src/shared/events/clientEvents.ts
- [ ] Update useClientEvent documentation

---

## Appendix B: Import Update Patterns

### Phase 2 Import Updates

```typescript
// dataStores move (Phase 2.1)
OLD: import { addLocalNpc } from "@web/dataStores/npcStore";
NEW: import { addLocalNpc } from "@modules/data/dataStores/npcStore";

OLD: import { multibindStore } from "@web/dataStores/multibindStore";
NEW: import { multibindStore } from "@modules/data/dataStores/multibindStore";

OLD: import { mapStore } from "@web/dataStores/mapStore";
NEW: import { mapStore } from "@modules/data/dataStores/mapStore";

// MockPort removal (Phase 2.2)
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

### 2025-11-19 Update (Event Handling Unification)
- **NEW PHASE 6.6**: Unify event handling architecture (3-4 hours)
- Analyzed all three event systems (EventBus, Client wrapper, ArkadiaClient wrapper)
- Identified redundancy: Client and ArkadiaClient are pure pass-throughs to eventBus
- No added functionality from wrappers - just extra API surface
- Proposed removal of wrapper methods from Client and ArkadiaClient
- Created centralized event helper module (`src/client/events.ts`)
- Migration guide for scripts (90+ files) and ArkadiaClient
- Comprehensive documentation (EVENT_SYSTEM.md, README updates, JSDoc)
- Benefits: single event system, reduced API surface, less confusion
- Updated timeline: 28-41 hours total (up from 25-37)

### 2025-11-19 Update (Backward Compatibility Bridge Removal)
- **NEW PHASE 6.5**: Remove backward compatibility bridge (2-3 hours)
- Added complete guide for removing scriptStateBridge after migration
- Prerequisites checklist for verifying all scripts/components migrated
- Audit commands for finding remaining state event usage
- Event type cleanup guide (remove state events, keep system events)
- useClientEvent documentation update with clear usage guidelines
- Manual testing checklist for all state features
- Performance verification steps
- Rollback plan for issues
- Updated timeline: 25-37 hours total (up from 23-34)

### 2025-11-19 Update (ansiParser Cleanup)
- ✅ Removed all references to ansiParser.ts (already deleted from codebase)
- Updated Phase 0 to reflect ANSI rendering via AnsiAwareBuffer.toDom()
- Removed Phase 2.1 (was ansiParser consolidation)
- Renumbered Phase 2 tasks (2.2 → 2.1, 2.3 → 2.2, 2.4 → 2.3)
- Updated Appendix A and B to remove ansiParser file moves
- Cleaned up circular dependency documentation

### 2025-11-19 Update (Script-React State Integration)
- **NEW PHASE 1.5**: Comprehensive solution for script-React state sharing (3-4 hours)
- Analyzed entire script system architecture (90+ scripts)
- Documented current communication patterns:
  - EventBus-based state emission
  - Multiple subscription patterns (port, storage, DataStore, eventBus)
  - Closure-based state management
  - Character-scoped storage
- Identified critical issues:
  - No single source of truth (state in closures + React state)
  - Race conditions (components mounting after script init)
  - Difficult testing and debugging
  - No character context for state reset
- **Proposed Solution**: Zustand-based state bridge
  - Single source of truth for all script state
  - Scripts update Zustand store directly (non-React API)
  - React components read from store (hooks)
  - Backward compatibility bridge for gradual migration
  - Character context for proper state reset
  - Storage bridge for persistence
  - DevTools support for debugging
- Created comprehensive state architecture with:
  - Complete GameState interface (timers, character, combat, inventory, room, UI)
  - Actions for scripts to update state
  - Example migrations for scripts and components
  - Character switching pattern
  - Storage integration pattern
- Updated timeline: 23-34 hours total (up from 20-30)

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

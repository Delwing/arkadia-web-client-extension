# Code & Architecture Reorganization Plan

**Status**: Planning Phase
**Created**: 2025-11-04
**Last Updated**: 2025-11-04

---

## Executive Summary

This document outlines a comprehensive plan to reorganize the codebase architecture, eliminating technical debt from the incomplete React migration and establishing clear separation of concerns.

### Current Issues
- 10+ duplicate components (class-based vs React)
- Circular dependencies between `@client` ↔ `@web`
- Oversized entry point (`main.ts` at 1577 lines)
- DataStores split across multiple directories
- Duplicate type definitions

### Goals
- ✅ Zero circular dependencies
- ✅ Single source of truth for all components and types
- ✅ Clear, documented dependency hierarchy
- ✅ Maintainable codebase with separation of concerns

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
- `src/web/main.ts`: 1577 lines
- Mixes initialization, UI mounting, event handling, etc.

---

## Phase 1: Complete Component Migration

**Priority**: Critical
**Estimated Effort**: 2-4 hours
**Dependencies**: None

### Objectives
- Remove all duplicate class-based components
- Use only React versions
- Update `main.ts` to remove legacy initialization
- Verify no regressions

### Tasks

#### 1.1 Verify React Components are Production-Ready
```bash
# Check all React components are being used
grep -r "mountComponents" src/web/main.ts
```

**Components to verify**:
- ✓ CombatTimer
- ✓ CoverTimer
- ✓ LampTimer
- ✓ TransportTimer
- ✓ ZaskTimer
- ✓ CharState
- ✓ CharStateInfo
- ✓ BreakItemWarning
- ✓ MultiBinds
- ✓ ReleaseGuard

#### 1.2 Update main.ts
Remove legacy component initialization code:
```typescript
// REMOVE these lines from main.ts:
import CombatTimer from "./CombatTimer";
import CoverTimer from "./CoverTimer";
// ... etc

// REMOVE instantiation:
const combatTimer = new CombatTimer(...);
const coverTimer = new CoverTimer(...);
// ... etc
```

Ensure only `mountComponents()` from React is used.

#### 1.3 Delete Legacy Component Files
```bash
# Files to delete:
rm src/web/CombatTimer.ts
rm src/web/CoverTimer.ts
rm src/web/LampTimer.ts
rm src/web/TransportTimer.ts
rm src/web/ZaskTimer.ts
rm src/web/CharState.ts
rm src/web/CharStateInfo.ts
rm src/web/BreakItemWarning.ts
rm src/web/MultiBinds.ts
rm src/web/ReleaseGuard.ts
```

#### 1.4 Run Tests
```bash
yarn test
yarn test:e2e
yarn build
```

### Success Criteria
- ✅ All tests passing
- ✅ Build successful
- ✅ No references to deleted files
- ✅ ~500 lines of dead code removed

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

#### 2.1 Move ansiParser to Client

**Current**: `src/web/ansiParser.ts`
**Target**: `src/client/ansi/ansiParser.ts`

**Rationale**: ANSI parsing is core client functionality, not web-specific.

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

4. Run tests

**Files to update**:
- `src/client/Client.ts`
- Any other files importing from `@web/ansiParser`

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

#### 2.3 Verify Dependency Flow

After Phase 2.1 and 2.2, verify no circular dependencies:

```bash
# Check client doesn't import from web
grep -r "@web" src/client/

# Should return: NO MATCHES
```

### Success Criteria
- ✅ No imports from `@web` in `src/client/`
- ✅ All dataStores in one location
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
├── ansiParser.ts (MOVED in Phase 2)
├── CombatTimer.ts (DELETED in Phase 1)
├── embed.ts
├── FightTitle.ts
├── fontLoader.ts
├── HpTitle.ts
├── logBrowser.ts
├── main.ts
├── mapDataLoader.ts
├── MockPort.ts
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
│   ├── ArkadiaClient.ts
│   └── MockPort.ts
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
git mv src/web/MockPort.ts src/web/adapters/
```

Create `src/web/adapters/index.ts`:
```typescript
export { default as ArkadiaClient } from './ArkadiaClient';
export { MockPort } from './MockPort';
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
- ✅ Phase 1: Complete Component Migration (2-4 hours)
- ✅ Phase 2: Break Circular Dependencies (3-5 hours)

### Sprint 2 (Week 2)
- ✅ Phase 3: Consolidate Type Definitions (2-3 hours)
- ✅ Phase 4: Reorganize Web Directory (3-4 hours)

### Sprint 3 (Week 3)
- ✅ Phase 5: Refactor main.ts (4-6 hours)

### Sprint 4 (Week 4)
- ✅ Phase 6: Documentation & Cleanup (2-3 hours)
- ✅ Final testing and validation

### Optional (Future)
- Phase 7: Optional enhancements as needed

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
- Phase 1 (Component Migration) - React components already working
- Phase 3 (Type Consolidation) - TypeScript will catch errors
- Phase 6 (Documentation) - No code changes

### Medium Risk
- Phase 2 (Break Circular Dependencies) - Requires careful import updates
- Phase 4 (Reorganize Web) - Many file moves, but tests will catch issues

### High Risk
- Phase 5 (Refactor main.ts) - Critical entry point, needs thorough testing

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

### Phase 1: Delete
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

### Phase 2: Move
- [ ] src/web/ansiParser.ts → src/client/ansi/ansiParser.ts
- [ ] src/web/dataStores/mapStore.ts → src/modules/data/dataStores/mapStore.ts
- [ ] src/web/dataStores/multibindStore.ts → src/modules/data/dataStores/multibindStore.ts
- [ ] src/web/dataStores/npcStore.ts → src/modules/data/dataStores/npcStore.ts

### Phase 3: Move
- [ ] src/client/types/herbs.ts → src/shared/types/herbs.ts
- [ ] src/client/types/letter.ts → src/shared/types/letter.ts
- [ ] src/client/types/people.ts → src/shared/types/people.ts
- [ ] src/client/types/transport.ts → src/shared/types/transport.ts
- [ ] src/client/types/MapData.d.ts → src/shared/types/MapData.d.ts (merge with web version)
- [ ] Delete src/web/types/MapData.d.ts

### Phase 4: Move
- [ ] src/web/ArkadiaClient.ts → src/web/adapters/ArkadiaClient.ts
- [ ] src/web/MockPort.ts → src/web/adapters/MockPort.ts
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
// ansiParser moves
OLD: import { parseAnsiPatterns } from "@web/ansiParser";
NEW: import { parseAnsiPatterns } from "@client/ansi/ansiParser";

// dataStores move
OLD: import { addLocalNpc } from "@web/dataStores/npcStore";
NEW: import { addLocalNpc } from "@modules/data/dataStores/npcStore";

OLD: import { multibindStore } from "@web/dataStores/multibindStore";
NEW: import { multibindStore } from "@modules/data/dataStores/multibindStore";

OLD: import { mapStore } from "@web/dataStores/mapStore";
NEW: import { mapStore } from "@modules/data/dataStores/mapStore";
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

**End of Architecture Reorganization Plan**

# Slice 7 Implementation Plan: Incremental React Component Extraction

**Created:** 2025-11-03
**Branch:** migration-slices

## Overview

This document outlines the implementation plan for Slice 7 of the merge plan, focusing on migrating imperative DOM manipulation code to React components.

---

## Objectives

1. Identify non-React UI islands (status panels, modal controls, settings forms)
2. Migrate them one-by-one into typed React components under `src/ui/web/components/`
3. Maintain imperative wrappers during migration for legacy script compatibility
4. Explicitly exclude the map renderer and main output div from this pass

---

## Discovered UI Islands

### Total: 18 Imperative UI Classes

**Good Migration Candidates: 15**
**Excluded: 3** (map renderer, main output, already React)

### Categorization

#### Simple Timers (Priority: HIGH)
1. `LampTimer.ts:1` - Lamp timer display
2. `CoverTimer.ts:1` - Cover timer display
3. `ZaskTimer.ts:1` - Zask timer with status
4. `CombatTimer.ts:1` - Combat timer with colors
5. `TransportTimer.ts:1` - Transport timer with labels

#### Simple Panels (Priority: HIGH)
6. `CharStateInfo.ts:1` - Character state info display
7. `ReleaseGuard.ts:1` - Release guard toggle button
8. `BreakItemWarning.ts:1` - Break item warning panel
9. `MultiBinds.ts:1` - Multi-bind button grid

#### Medium Complexity (Priority: MEDIUM)
10. `CharState.ts:1` - Complex status panel with multiple modes
11. `LetterComposer.ts:1` - Modal form with drag handling
12. `HpTitle.ts:1` - HP title wrapper
13. `FightTitle.ts:1` - Fight title updater

#### Defer to Later Slices (Priority: LOW - Too Complex)
14. `MobileDirectionButtons.ts:1` - Complex mobile UI (Slice 7.2+)
15. `MobileCommandRadial.ts:1` - Complex radial menu (Slice 7.2+)
16. `ObjectList.ts:1` - Complex list with PiP modal (Slice 7.3+)
17. `logBrowser.ts:1` - Very complex search/browse modal (Phase 2+)

---

## Phase 1: Slice 7.0 (Initial Migration)

### Scope
Migrate **10 simple components** to React:
- 5 simple timers
- 4 simple panels
- 1 medium complexity panel (CharState)

### Directory Structure

```
src/ui/web/
├── components/
│   ├── timers/
│   │   ├── LampTimer.tsx
│   │   ├── CoverTimer.tsx
│   │   ├── ZaskTimer.tsx
│   │   ├── CombatTimer.tsx
│   │   ├── TransportTimer.tsx
│   │   └── shared/
│   │       └── TimerDisplay.tsx (reusable)
│   ├── panels/
│   │   ├── CharStateInfo.tsx
│   │   ├── ReleaseGuard.tsx
│   │   ├── BreakItemWarning.tsx
│   │   ├── MultiBinds.tsx
│   │   └── CharState.tsx
│   └── index.ts (re-exports)
├── hooks/
│   ├── useClientEvent.ts (listen to ArkadiaClient events)
│   ├── useClientCommand.ts (send commands to ArkadiaClient)
│   └── useLocalStorage.ts (localStorage persistence)
└── wrappers/
    ├── imperativeWrapper.ts (HOC for imperative mounting)
    └── index.ts
```

### Implementation Steps

#### Step 1: Create Directory Structure
```bash
mkdir -p src/ui/web/components/timers/shared
mkdir -p src/ui/web/components/panels
mkdir -p src/ui/web/hooks
mkdir -p src/ui/web/wrappers
```

#### Step 2: Create Shared Hooks

**src/ui/web/hooks/useClientEvent.ts**
```typescript
// Hook to subscribe to ArkadiaClient events
// Usage: useClientEvent('gmcp.Room.Info', (data) => { ... })
```

**src/ui/web/hooks/useClientCommand.ts**
```typescript
// Hook to send commands to ArkadiaClient
// Usage: const sendCommand = useClientCommand()
```

**src/ui/web/hooks/useLocalStorage.ts**
```typescript
// Hook for localStorage with type safety
// Usage: const [value, setValue] = useLocalStorage('key', defaultValue)
```

#### Step 3: Create Imperative Wrapper Utility

**src/ui/web/wrappers/imperativeWrapper.ts**
```typescript
// Utility to wrap React components with imperative API
// Allows legacy scripts to mount/unmount components
// Pattern: createImperativeComponent(Component) => { mount, unmount, update }
```

#### Step 4: Migrate Components One by One

**Order:**
1. **LampTimer** - Simplest timer (est. 30 min)
2. **CoverTimer** - Simple timer (est. 30 min)
3. **ZaskTimer** - Timer with status (est. 45 min)
4. **CombatTimer** - Timer with colors (est. 45 min)
5. **TransportTimer** - Timer with labels (est. 45 min)
6. **CharStateInfo** - Simple display (est. 30 min)
7. **ReleaseGuard** - Toggle button (est. 45 min)
8. **BreakItemWarning** - Warning panel (est. 45 min)
9. **MultiBinds** - Button grid (est. 1 hour)
10. **CharState** - Complex status panel (est. 2-3 hours)

**Total Estimated Time: 8-10 hours**

#### Step 5: Update main.ts

Update `web-client/src/main.ts:1` to:
- Import new React components
- Mount them using createRoot() or imperative wrappers
- Remove old imperative class instantiations

#### Step 6: Testing

- Test each component individually
- Test integration with ArkadiaClient events
- Verify legacy script compatibility
- Run `yarn --cwd web-client test`
- Run `yarn --cwd web-client build`

---

## Phase 2: Slice 7.1 (Medium Complexity)

### Scope
- LetterComposer (modal with drag)
- HpTitle / FightTitle (title updaters)

**Estimated Time: 4-6 hours**

---

## Phase 3: Slice 7.2+ (Complex Components)

### Scope
- MobileDirectionButtons
- MobileCommandRadial
- ObjectList
- logBrowser

**Estimated Time: 20-30 hours**

---

## Migration Pattern

### Example: LampTimer Migration

**Before (Imperative):**
```typescript
// web-client/src/LampTimer.ts
class LampTimer {
  private element: HTMLElement;

  constructor(client: ArkadiaClient) {
    this.element = document.getElementById('lamp-timer')!;
    client.on('gmcp.Char.Vitals', this.update.bind(this));
  }

  update(data: any) {
    this.element.textContent = data.lampTime;
    this.element.style.display = data.lampTime ? 'block' : 'none';
  }
}
```

**After (React):**
```tsx
// src/ui/web/components/timers/LampTimer.tsx
import { useClientEvent } from '../../hooks/useClientEvent';

export const LampTimer: React.FC = () => {
  const [lampTime, setLampTime] = useState<string | null>(null);

  useClientEvent('gmcp.Char.Vitals', (data) => {
    setLampTime(data.lampTime);
  });

  if (!lampTime) return null;

  return (
    <div id="lamp-timer" className="timer">
      {lampTime}
    </div>
  );
};
```

**Wrapper (for legacy compatibility):**
```typescript
// src/ui/web/wrappers/LampTimerWrapper.ts
import { createImperativeComponent } from './imperativeWrapper';
import { LampTimer } from '../components/timers/LampTimer';

export const LampTimerWrapper = createImperativeComponent(LampTimer);

// Usage in main.ts:
// const lampTimer = new LampTimerWrapper('#lamp-timer-root');
```

---

## Key Considerations

### Event System
- All components use ArkadiaClient event system
- Need `useClientEvent` hook to bridge imperative events to React
- Should unsubscribe on unmount

### DOM Structure
- Existing HTML has element IDs that components query
- Options:
  1. Keep IDs and mount React into existing DOM
  2. Create new React-managed DOM and update HTML
- **Recommendation:** Option 1 for gradual migration

### Storage Integration
- Several components use localStorage
- Create `useLocalStorage` hook for consistency
- Handle serialization/deserialization

### Styling
- Current: Mix of inline styles and CSS classes
- Options:
  1. Keep existing CSS, use className
  2. Migrate to CSS modules
  3. Use Tailwind CSS
- **Recommendation:** Keep existing CSS for now, refactor styles later

### Type Safety
- All components should be fully typed
- Use TypeScript interfaces for props and state
- Import event data types from shared modules

---

## Testing Strategy

### Unit Tests
- Test each component in isolation
- Mock useClientEvent hook
- Test different state transitions

### Integration Tests
- Test mounting/unmounting
- Test event flow from ArkadiaClient
- Test imperative wrapper API

### E2E Tests
- Verify components render correctly in browser
- Test interactions (buttons, toggles)
- Verify no regressions in functionality

---

## Risks & Mitigation

### Risk 1: Event System Incompatibility
**Mitigation:** Create robust hook that handles all event patterns, test thoroughly

### Risk 2: Performance Regression
**Mitigation:** Use React.memo, measure render times, optimize if needed

### Risk 3: Legacy Script Breakage
**Mitigation:** Maintain imperative wrappers, provide migration guide

### Risk 4: Styling Conflicts
**Mitigation:** Use CSS modules or scoped styles, namespace classes

---

## Success Criteria

1. ✅ All 10 target components migrated to React
2. ✅ All components fully typed with TypeScript
3. ✅ Imperative wrappers provided for legacy compatibility
4. ✅ All tests passing (`yarn --cwd web-client test`)
5. ✅ Build successful (`yarn --cwd web-client build`)
6. ✅ No visual or functional regressions
7. ✅ Code documented with JSDoc comments

---

## Next Steps

After completing Slice 7.0:
1. Document migration patterns for future components
2. Create migration guide for developers
3. Plan Slice 7.1 (medium complexity components)
4. Consider creating component library/storybook

---

## References

- Original Plan: `docs/refactor/web-client-client-merge-plan.md`
- Current Implementations:
  - `web-client/src/LampTimer.ts:1`
  - `web-client/src/CoverTimer.ts:1`
  - `web-client/src/ZaskTimer.ts:1`
  - `web-client/src/CombatTimer.ts:1`
  - `web-client/src/TransportTimer.ts:1`
  - `web-client/src/CharStateInfo.ts:1`
  - `web-client/src/ReleaseGuard.ts:1`
  - `web-client/src/BreakItemWarning.ts:1`
  - `web-client/src/MultiBinds.ts:1`
  - `web-client/src/CharState.ts:1`
- Main Bootstrap: `web-client/src/main.ts:30-60`

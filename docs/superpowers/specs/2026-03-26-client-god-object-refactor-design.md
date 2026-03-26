# Client.ts God Object Refactor

## Goal

Break down `Client.ts` (729 lines) from a god object into a thin facade that delegates to focused manager classes. Scripts continue receiving the full Client — no external API changes.

## Current State

Client.ts mixes 6+ responsibilities:
- Key binding management (~170 lines): bind state, keydown handler, applyBinds, setTempBind
- Command processing (~100 lines): sendCommand pipeline, hooks, aliases, object shortcuts
- Movement logic (~50 lines): sendMovement, applyMoveMode, carriageMode, pre/post walk
- Notification (~25 lines): enableNotifications, notify, service worker
- Output/printing (~30 lines): print, println, buffer
- Content width (~20 lines): DOM measurement
- Event delegation: on/off/emit/sendEvent wrappers

Existing managers (TeamManager, ObjectManager, MapHelper, SoundManager) already follow the pattern of receiving Client in their constructor.

## Design

### Extracted Classes

All new classes live in `src/client/` alongside existing managers.

#### 1. KeyBindingManager

**File:** `src/client/KeyBindingManager.ts`

**Owns:**
- Properties: lampBind, attackBind, supportBind, moveModeBind, customBinds, tempBinds
- Constructor logic: `window.addEventListener('keydown', ...)` handler (~55 lines)
- Constructor logic: `applyBinds()` function + `globalStorage.onChange('binds', ...)` listener (~95 lines)
- Method: `setTempBind(index, command)`

**Receives:** Client (same pattern as TeamManager)

**Notes:**
- The keydown handler references `client.AllyProtection`, `client.TeamManager`, `client.attackCommand`, `client.sendCommand` — all accessed through the Client reference
- `applyBinds` also updates `client.FunctionalBind` — accessed through Client

#### 2. CommandProcessor

**File:** `src/client/CommandProcessor.ts`

**Owns:**
- Properties: aliases, commandHooks
- Methods: `sendCommand()`, `registerCommandHook()`, `unregisterCommandHook()`
- Private methods: `expandObjectShortcuts()`

**Receives:** Client

**Notes:**
- `sendCommand` calls `client.Map.parseCommand()`, `client.ObjectManager`, `client.send()`, and `MovementManager.sendMovement()`
- Alias callbacks may return Promises (awaited in current code)
- The `sendCommand` method is recursive (splits on `;` / `#` and calls itself)

#### 3. MovementManager

**File:** `src/client/MovementManager.ts`

**Owns:**
- Properties: moveMode, carriageMode, preWalkCommands, postWalkCommands
- Methods: `sendMovement()`, `applyMoveMode()`, `applyMoveModePrefix()`

**Receives:** Client

**Notes:**
- `sendMovement` calls `client.Map.move()`, `client.clientAdapter.send()`, and `client.sendCommand()` (for pre/post walk commands)
- Called by CommandProcessor at the end of the sendCommand pipeline

#### 4. NotificationManager

**File:** `src/client/NotificationManager.ts`

**Owns:**
- Methods: `enableNotifications()`, `notify(message)`

**Receives:** nothing (fully standalone, uses browser Notification API directly)

### Client.ts After Refactoring

~150-200 lines. Responsibilities:

1. **Composition:** creates all managers in constructor, wires them together
2. **Facade properties/methods:** exposes bind properties, sendCommand, notify, moveMode, etc. that delegate to managers — preserving the existing API
3. **Kept directly:** print/println/buffer, onLine/trigger parsing, updateContentWidth, event delegation (on/off/emit/sendEvent), send/echoCommand, prepareSounds
4. **Settings listeners:** attackCommand/drawWeaponCommand from characterStorage (stays in Client since these are used by multiple managers)

### Facade Pattern

Client exposes delegating properties and methods so scripts don't break:

```typescript
// Property delegation examples
get lampBind() { return this.keyBindingManager.lampBind; }
set lampBind(v) { this.keyBindingManager.lampBind = v; }

get moveMode() { return this.movementManager.moveMode; }
set moveMode(v) { this.movementManager.moveMode = v; }

get aliases() { return this.commandProcessor.aliases; }

// Method delegation examples
sendCommand(...args) { return this.commandProcessor.sendCommand(...args); }
notify(msg) { return this.notificationManager.notify(msg); }
setTempBind(i, cmd) { return this.keyBindingManager.setTempBind(i, cmd); }
```

### What Does NOT Change

- All 130+ scripts keep receiving Client and calling `client.sendCommand()`, `client.notify()`, etc.
- No changes to `ClientAdapter` interface
- No changes to `ClientEvents` or event bus
- Existing managers (TeamManager, ObjectManager, MapHelper, SoundManager, FunctionalBind, AttackController, AllyProtection) stay as-is
- All existing tests should pass with no modifications (API is preserved)

## File Changes Summary

| File | Action |
|------|--------|
| `src/client/KeyBindingManager.ts` | New |
| `src/client/CommandProcessor.ts` | New |
| `src/client/MovementManager.ts` | New |
| `src/client/NotificationManager.ts` | New |
| `src/client/Client.ts` | Refactor — remove extracted code, add manager creation + facade delegates |

## Testing Strategy

- Existing `test/client/Client.test.ts` should pass unchanged (facade preserves API)
- New unit tests for each extracted manager can be added later
- Run full test suite after refactoring to catch regressions

## Risks

- **Property access order in constructor:** managers created in constructor reference Client properties that may not be initialized yet. Mitigation: create managers after all direct Client properties are set.
- **Circular calls:** CommandProcessor calls MovementManager.sendMovement, MovementManager calls client.sendCommand (which goes to CommandProcessor). This works because it's runtime dispatch, not construction-time — same as current code.

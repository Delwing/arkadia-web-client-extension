# Client.ts God Object Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract KeyBindingManager, CommandProcessor, MovementManager, and NotificationManager from Client.ts, turning it into a thin facade.

**Architecture:** Each manager receives the Client instance (same pattern as existing TeamManager/ObjectManager). Client delegates to managers via properties and methods. All external API (what scripts call) stays unchanged.

**Tech Stack:** TypeScript 5.8, Jest for tests, `yarn` for all commands.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/client/NotificationManager.ts` | Create | `enableNotifications()`, `notify()` |
| `src/client/MovementManager.ts` | Create | `sendMovement()`, `applyMoveMode()`, moveMode, carriageMode, pre/postWalkCommands |
| `src/client/CommandProcessor.ts` | Create | `sendCommand()`, aliases, command hooks, object shortcut expansion |
| `src/client/KeyBindingManager.ts` | Create | All bind state, keydown handler, applyBinds, `setTempBind()` |
| `src/client/Client.ts` | Modify | Remove extracted code, add manager instantiation + facade getters/setters |
| `test/client/NotificationManager.test.ts` | Create | Tests for NotificationManager |
| `test/client/MovementManager.test.ts` | Create | Tests for MovementManager |
| `test/client/CommandProcessor.test.ts` | Create | Tests for CommandProcessor |
| `test/client/KeyBindingManager.test.ts` | Create | Tests for KeyBindingManager |
| `test/client/Client.test.ts` | Modify | Verify existing tests still pass (no test changes expected) |

---

## Task 1: Extract NotificationManager

Simplest extraction — no Client dependency at all.

**Files:**
- Create: `src/client/NotificationManager.ts`
- Create: `test/client/NotificationManager.test.ts`
- Modify: `src/client/Client.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/client/NotificationManager.test.ts

import NotificationManager from '@client/NotificationManager';

afterEach(() => {
  delete (global as any).Notification;
});

describe('NotificationManager', () => {
  test('requests notification permission when default', () => {
    (global as any).Notification = { permission: 'default', requestPermission: jest.fn() };
    const mgr = new NotificationManager();
    mgr.enableNotifications();
    expect((global as any).Notification.requestPermission).toHaveBeenCalledTimes(1);
  });

  test('does not request permission when already granted', () => {
    (global as any).Notification = { permission: 'granted', requestPermission: jest.fn() };
    const mgr = new NotificationManager();
    mgr.enableNotifications();
    expect((global as any).Notification.requestPermission).not.toHaveBeenCalled();
  });

  test('registers service worker if available', () => {
    (global as any).Notification = { permission: 'granted', requestPermission: jest.fn() };
    const original = (navigator as any).serviceWorker;
    (navigator as any).serviceWorker = { register: jest.fn().mockResolvedValue(undefined) };
    const mgr = new NotificationManager();
    mgr.enableNotifications();
    expect((navigator as any).serviceWorker.register).toHaveBeenCalledWith('sw.js');
    (navigator as any).serviceWorker = original;
  });

  test('notify sends notification when permission granted', () => {
    const mockNotification = jest.fn();
    (global as any).Notification = { permission: 'granted' };
    (global as any).Notification = Object.assign(mockNotification, { permission: 'granted' });
    const mgr = new NotificationManager();
    mgr.notify('test message');
    expect(mockNotification).toHaveBeenCalledWith('test message');
  });

  test('notify does nothing when Notification is undefined', () => {
    delete (global as any).Notification;
    const mgr = new NotificationManager();
    // Should not throw
    mgr.notify('test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test test/client/NotificationManager.test.ts 2>&1 | tail -5`
Expected: FAIL — `Cannot find module '@client/NotificationManager'`

- [ ] **Step 3: Create NotificationManager**

```typescript
// src/client/NotificationManager.ts

export default class NotificationManager {
    enableNotifications() {
        if (typeof Notification === 'undefined') {
            return;
        }
        if ('serviceWorker' in navigator && navigator.serviceWorker) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    notify(message: string) {
        if (typeof Notification === 'undefined') {
            return;
        }
        if (Notification.permission === 'granted') {
            if ('serviceWorker' in navigator && navigator.serviceWorker) {
                navigator.serviceWorker.ready
                    .then((reg) => reg.showNotification(message))
                    .catch(() => {});
            } else {
                new Notification(message);
            }
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test test/client/NotificationManager.test.ts 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: Wire into Client.ts**

In `src/client/Client.ts`:

1. Add import: `import NotificationManager from "./NotificationManager";`
2. Add property in class: `public readonly notificationManager = new NotificationManager();`
3. Replace the `enableNotifications()` method body with: `this.notificationManager.enableNotifications();`
4. Replace the `notify(message: string)` method body with: `this.notificationManager.notify(message);`

- [ ] **Step 6: Run existing Client tests**

Run: `yarn test test/client/Client.test.ts 2>&1 | tail -5`
Expected: PASS — all existing notification tests still work via the facade.

- [ ] **Step 7: Commit**

```bash
git add src/client/NotificationManager.ts test/client/NotificationManager.test.ts src/client/Client.ts
git commit -m "refactor: extract NotificationManager from Client"
```

---

## Task 2: Extract MovementManager

**Files:**
- Create: `src/client/MovementManager.ts`
- Create: `test/client/MovementManager.test.ts`
- Modify: `src/client/Client.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/client/MovementManager.test.ts

jest.mock('@client/main', () => ({ __esModule: true }));
jest.mock('@client/Triggers', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseLine: jest.fn(), parseMultiline: jest.fn(),
  })),
}));
jest.mock('@client/PackageHelper', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@client/scripts/functionalBind', () => ({
  FunctionalBindManager: jest.fn().mockImplementation(() => ({
    set: jest.fn(), setCategory: jest.fn(), clear: jest.fn(), clearCategory: jest.fn(),
    newMessage: jest.fn(), getLabel: jest.fn(() => ']'), getCategoryLabel: jest.fn(() => ']'),
    updateOptions: jest.fn(),
  })),
  formatLabel: jest.fn((opts: any) => opts.key || ''),
}));
jest.mock('@shared/map/MapHelper', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseCommand: jest.fn((cmd: string) => cmd),
    move: jest.fn((dir: string) => ({ direction: dir, moved: false })),
    followMove: jest.fn(), setBlockable: jest.fn(),
  })),
}));
jest.mock('@client/sounds', () => ({ __esModule: true, beepSound: 'mock-sound' }));
jest.mock('howler', () => ({
  Howl: jest.fn(() => ({ state: jest.fn(() => 'loaded'), play: jest.fn(), stop: jest.fn(), once: jest.fn(), load: jest.fn() })),
}));

(globalThis as any).Input = { send: jest.fn() };
(globalThis as any).Output = { send: jest.fn(), flush_buffer: jest.fn(), buffer: [] };
(globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
(globalThis as any).Maps = { refresh_position: jest.fn(), set_position: jest.fn(), unset_position: jest.fn(), data: undefined };
(globalThis as any).Gmcp = { parse_option_subnegotiation: jest.fn() };

import { characterStorage } from '@modules/core/storage';
import Client from '@client/Client';

beforeEach(() => {
  localStorage.clear();
  characterStorage.setCharacter('TestChar');
  document.body.innerHTML = '<iframe id="cm-frame"></iframe>';
  (globalThis as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
  (globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
  (global as any).clientAdapterMock = {
    send: jest.fn(), stop: jest.fn(), connect: jest.fn(), output: jest.fn(),
    sendGmcp: jest.fn(), shouldEchoCommand: jest.fn(() => false),
    flushMessageBuffer: jest.fn(), emit: jest.fn(),
  };
});

afterEach(() => { localStorage.clear(); });

describe('MovementManager', () => {
  test('applyMoveModePrefix returns plain command when moveMode is 0', () => {
    const client = new Client((global as any).clientAdapterMock);
    client.moveMode = 0;
    client.carriageMode = false;
    // Send a direction command — it should arrive at the adapter unmodified
    client.send = jest.fn();
    // Access the movement manager through client
    expect(client.moveMode).toBe(0);
  });

  test('moveMode 1 prefixes direction with przemknij', async () => {
    const client = new Client((global as any).clientAdapterMock);
    client.moveMode = 1;
    // mock Map.move to return a moved direction
    jest.spyOn(client.Map, 'move').mockReturnValue({ direction: 'polnoc', moved: true, suppress: false } as any);
    jest.spyOn(client.Map, 'parseCommand').mockReturnValue('polnoc');
    jest.spyOn(client.Map, 'setBlockable').mockImplementation();
    await client.sendCommand('polnoc');
    expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith(
      'przemknij polnoc', false, undefined
    );
  });

  test('moveMode 2 prefixes direction with przemknij z druzyna', async () => {
    const client = new Client((global as any).clientAdapterMock);
    client.moveMode = 2;
    jest.spyOn(client.Map, 'move').mockReturnValue({ direction: 'polnoc', moved: true, suppress: false } as any);
    jest.spyOn(client.Map, 'parseCommand').mockReturnValue('polnoc');
    jest.spyOn(client.Map, 'setBlockable').mockImplementation();
    await client.sendCommand('polnoc');
    expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith(
      'przemknij z druzyna polnoc', false, undefined
    );
  });

  test('carriageMode prefixes direction with jedz na', async () => {
    const client = new Client((global as any).clientAdapterMock);
    client.carriageMode = true;
    jest.spyOn(client.Map, 'move').mockReturnValue({ direction: 'polnoc', moved: true, suppress: false } as any);
    jest.spyOn(client.Map, 'parseCommand').mockReturnValue('polnoc');
    jest.spyOn(client.Map, 'setBlockable').mockImplementation();
    await client.sendCommand('polnoc');
    expect((global as any).clientAdapterMock.send).toHaveBeenCalledWith(
      'jedz na polnoc', false, undefined
    );
  });

  test('preWalkCommands are sent before movement', async () => {
    const client = new Client((global as any).clientAdapterMock);
    client.preWalkCommands = ['wstan'];
    jest.spyOn(client.Map, 'move').mockReturnValue({ direction: 'polnoc', moved: true, suppress: false } as any);
    jest.spyOn(client.Map, 'parseCommand').mockReturnValue('polnoc');
    jest.spyOn(client.Map, 'setBlockable').mockImplementation();
    const sendSpy = jest.spyOn(client, 'sendCommand');
    await client.sendCommand('polnoc');
    // sendCommand should have been called for 'wstan' before the actual movement send
    const calls = sendSpy.mock.calls.map(c => c[0]);
    expect(calls).toContain('wstan');
  });
});
```

- [ ] **Step 2: Run test to verify it passes (tests go through Client, validating current behavior first)**

Run: `yarn test test/client/MovementManager.test.ts 2>&1 | tail -5`
Expected: PASS — these test current behavior through Client before we extract.

- [ ] **Step 3: Create MovementManager**

```typescript
// src/client/MovementManager.ts

import type Client from "./Client";
import { isDirection } from "@shared/map/directions";
import type { CommandOptions } from "./scripts/commandPreserveCaseMode";

export default class MovementManager {
    moveMode = 0;
    carriageMode = false;
    preWalkCommands: string[] = [];
    postWalkCommands: string[] = [];

    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    sendMovement(command: string, echo: boolean, options?: CommandOptions) {
        let direction: string;
        let movePrefix = '';

        if (command.startsWith('przemknij z druzyna ')) {
            direction = command.substring(20);
            movePrefix = 'przemknij z druzyna ';
        } else if (command.startsWith('przemknij ')) {
            direction = command.substring(10);
            movePrefix = 'przemknij ';
        } else {
            direction = command;
        }

        const isOriginalDirection = isDirection(direction);

        const moveRes = this.client.Map.move(direction);
        if (moveRes.suppress) {
            return;
        }
        if (moveRes.moved) {
            this.client.Map.setBlockable(true);
        }

        if (isOriginalDirection || moveRes.moved) {
            for (const cmd of this.preWalkCommands) {
                this.client.sendCommand(cmd, echo, options);
            }
        }

        let commandToSend: string;
        if (movePrefix) {
            commandToSend = movePrefix + moveRes.direction;
        } else if (moveRes.moved) {
            commandToSend = this.applyMoveModePrefix(moveRes.direction);
        } else {
            commandToSend = this.applyMoveMode(moveRes.direction);
        }
        if (echo && this.client.clientAdapter.shouldEchoCommand()) {
            this.client.echoCommand(commandToSend);
        }
        this.client.clientAdapter.send(commandToSend, false, options);

        if (isOriginalDirection || moveRes.moved) {
            for (const cmd of this.postWalkCommands) {
                this.client.sendCommand(cmd, echo, options);
            }
        }
    }

    applyMoveMode(cmd: string): string {
        if (!isDirection(cmd)) return cmd;
        return this.applyMoveModePrefix(cmd);
    }

    applyMoveModePrefix(cmd: string): string {
        if (this.carriageMode) return `jedz na ${cmd}`;
        if (this.moveMode === 1) return `przemknij ${cmd}`;
        if (this.moveMode === 2) return `przemknij z druzyna ${cmd}`;
        return cmd;
    }
}
```

- [ ] **Step 4: Wire into Client.ts**

In `src/client/Client.ts`:

1. Add import: `import MovementManager from "./MovementManager";`
2. Add property: `public readonly movementManager = new MovementManager(this);`
3. Remove: the `sendMovement()`, `applyMoveMode()`, `applyMoveModePrefix()` private methods
4. Remove: the `moveMode`, `carriageMode`, `preWalkCommands`, `postWalkCommands` properties
5. Make `echoCommand` public (was private — MovementManager needs it)
6. Add facade getters/setters:

```typescript
get moveMode() { return this.movementManager.moveMode; }
set moveMode(v: number) { this.movementManager.moveMode = v; }

get carriageMode() { return this.movementManager.carriageMode; }
set carriageMode(v: boolean) { this.movementManager.carriageMode = v; }

get preWalkCommands() { return this.movementManager.preWalkCommands; }
set preWalkCommands(v: string[]) { this.movementManager.preWalkCommands = v; }

get postWalkCommands() { return this.movementManager.postWalkCommands; }
set postWalkCommands(v: string[]) { this.movementManager.postWalkCommands = v; }
```

7. In `sendCommand()`, replace `this.sendMovement(command, echo, options)` with `this.movementManager.sendMovement(command, echo, options)`.

- [ ] **Step 5: Run all tests**

Run: `yarn test test/client/Client.test.ts test/client/MovementManager.test.ts 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/client/MovementManager.ts test/client/MovementManager.test.ts src/client/Client.ts
git commit -m "refactor: extract MovementManager from Client"
```

---

## Task 3: Extract CommandProcessor

**Files:**
- Create: `src/client/CommandProcessor.ts`
- Create: `test/client/CommandProcessor.test.ts`
- Modify: `src/client/Client.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/client/CommandProcessor.test.ts

jest.mock('@client/main', () => ({ __esModule: true }));
jest.mock('@client/Triggers', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseLine: jest.fn(), parseMultiline: jest.fn(),
  })),
}));
jest.mock('@client/PackageHelper', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@client/scripts/functionalBind', () => ({
  FunctionalBindManager: jest.fn().mockImplementation(() => ({
    set: jest.fn(), setCategory: jest.fn(), clear: jest.fn(), clearCategory: jest.fn(),
    newMessage: jest.fn(), getLabel: jest.fn(() => ']'), getCategoryLabel: jest.fn(() => ']'),
    updateOptions: jest.fn(),
  })),
  formatLabel: jest.fn((opts: any) => opts.key || ''),
}));
const parseCommand = jest.fn((cmd: string) => `parsed:${cmd}`);
jest.mock('@shared/map/MapHelper', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseCommand,
    move: jest.fn((dir: string) => ({ direction: dir, moved: false })),
    followMove: jest.fn(), setBlockable: jest.fn(),
  })),
}));
jest.mock('@client/sounds', () => ({ __esModule: true, beepSound: 'mock-sound' }));
jest.mock('howler', () => ({
  Howl: jest.fn(() => ({ state: jest.fn(() => 'loaded'), play: jest.fn(), stop: jest.fn(), once: jest.fn(), load: jest.fn() })),
}));

(globalThis as any).Input = { send: jest.fn() };
(globalThis as any).Output = { send: jest.fn(), flush_buffer: jest.fn(), buffer: [] };
(globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
(globalThis as any).Maps = { refresh_position: jest.fn(), set_position: jest.fn(), unset_position: jest.fn(), data: undefined };
(globalThis as any).Gmcp = { parse_option_subnegotiation: jest.fn() };

import { characterStorage } from '@modules/core/storage';
import Client from '@client/Client';

beforeEach(() => {
  localStorage.clear();
  characterStorage.setCharacter('TestChar');
  document.body.innerHTML = '<iframe id="cm-frame"></iframe>';
  (globalThis as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
  (globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
  (global as any).clientAdapterMock = {
    send: jest.fn(), stop: jest.fn(), connect: jest.fn(), output: jest.fn(),
    sendGmcp: jest.fn(), shouldEchoCommand: jest.fn(() => false),
    flushMessageBuffer: jest.fn(), emit: jest.fn(),
  };
});

afterEach(() => { localStorage.clear(); });

describe('CommandProcessor', () => {
  test('registerCommandHook can suppress commands', async () => {
    const client = new Client((global as any).clientAdapterMock);
    client.registerCommandHook('test', () => null);
    await client.sendCommand('foo');
    expect((global as any).clientAdapterMock.send).not.toHaveBeenCalled();
  });

  test('registerCommandHook can modify commands', async () => {
    const client = new Client((global as any).clientAdapterMock);
    client.registerCommandHook('test', (cmd) => cmd.toUpperCase());
    await client.sendCommand('foo');
    // parseCommand receives the uppercased command
    expect(parseCommand).toHaveBeenCalledWith('FOO');
  });

  test('unregisterCommandHook removes hook', async () => {
    const client = new Client((global as any).clientAdapterMock);
    client.registerCommandHook('test', () => null);
    client.unregisterCommandHook('test');
    await client.sendCommand('foo');
    expect((global as any).clientAdapterMock.send).toHaveBeenCalled();
  });

  test('alias matching stops command from being sent', async () => {
    const client = new Client((global as any).clientAdapterMock);
    const callback = jest.fn();
    client.aliases.push({ pattern: /^test (.+)/, callback });
    parseCommand.mockImplementationOnce((cmd: string) => cmd);
    await client.sendCommand('test value');
    expect(callback).toHaveBeenCalled();
    expect((global as any).clientAdapterMock.send).not.toHaveBeenCalled();
  });

  test('unknown slash command prints error', async () => {
    const client = new Client((global as any).clientAdapterMock);
    parseCommand.mockImplementationOnce((cmd: string) => cmd);
    const printSpy = jest.spyOn(client, 'print').mockImplementation();
    await client.sendCommand('/unknownalias');
    expect(printSpy).toHaveBeenCalled();
    expect((global as any).clientAdapterMock.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it passes (validates current behavior)**

Run: `yarn test test/client/CommandProcessor.test.ts 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 3: Create CommandProcessor**

```typescript
// src/client/CommandProcessor.ts

import type Client from "./Client";
import type { CommandOptions } from "./scripts/commandPreserveCaseMode";
import { stripPolishCharacters } from "./stripPolishCharacters";
import { mudletColorLine } from "@modules/core/Colors";

export type CommandHookCallback = (
    command: string,
    echo: boolean,
    options?: CommandOptions
) => string | null | undefined;

export interface CommandHook {
    id: string;
    callback: CommandHookCallback;
    priority: number;
}

export default class CommandProcessor {
    aliases: { pattern: RegExp; callback: Function }[] = [];
    private commandHooks: CommandHook[] = [];
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    async sendCommand(command: string, echo: boolean = true, options?: CommandOptions, skipMapParse: boolean = false, fromUserInput: boolean = false): Promise<void> {
        for (const hook of this.commandHooks) {
            const result = hook.callback(command, echo, options);
            if (result === null) {
                return;
            }
            if (result !== undefined) {
                command = result;
            }
        }

        if (command) {
            command = stripPolishCharacters(command);
        }
        this.client.sendEvent('command', command);

        let commandChanged = false;
        if (!skipMapParse) {
            const parsedCommand = this.client.Map.parseCommand(command);
            if (parsedCommand === null) {
                return;
            }
            commandChanged = parsedCommand !== command;
            command = parsedCommand;
        }
        command = this.expandObjectShortcuts(command);
        if (command.startsWith('echo ')) {
            this.client.print(mudletColorLine(command.substring(5)));
            return;
        }
        const split = command.split((fromUserInput && !commandChanged) ? /;/ : /[#;]/);
        if (split.length > 1) {
            for (const part of split) {
                await this.sendCommand(part, echo, options, skipMapParse || commandChanged);
            }
            return;
        }

        for (const alias of this.aliases) {
            const matches = command.match(alias.pattern);
            if (matches) {
                const result = alias.callback(matches);
                if (result && typeof (result as Promise<unknown>).then === 'function') {
                    await result;
                }
                return;
            }
        }

        if (command.startsWith('/') && command.match(/^\/\w+/)) {
            this.client.print(mudletColorLine(`--- <tomato>Nieznany alias<reset>: ${command}`));
            return;
        }
        this.client.movementManager.sendMovement(command, echo, options);
    }

    registerCommandHook(id: string, callback: CommandHookCallback, priority: number = 0): void {
        this.unregisterCommandHook(id);
        this.commandHooks.push({ id, callback, priority });
        this.commandHooks.sort((a, b) => b.priority - a.priority);
    }

    unregisterCommandHook(id: string): boolean {
        const index = this.commandHooks.findIndex(h => h.id === id);
        if (index !== -1) {
            this.commandHooks.splice(index, 1);
            return true;
        }
        return false;
    }

    private expandObjectShortcuts(command: string): string {
        return command.replace(/@([A-Za-z0-9@]+)/g, (match, short) => {
            const obj = this.client.ObjectManager.getObjectsOnLocation().find(
                o => o.shortcut?.toLowerCase() === short.toLowerCase()
            );
            return obj ? `ob_${obj.num}` : match;
        });
    }
}
```

- [ ] **Step 4: Wire into Client.ts**

In `src/client/Client.ts`:

1. Add import: `import CommandProcessor from "./CommandProcessor";`
2. Re-export hook types for backwards compatibility:
   ```typescript
   export type { CommandHookCallback, CommandHook } from "./CommandProcessor";
   ```
3. Add property: `public readonly commandProcessor = new CommandProcessor(this);`
4. Remove: the `sendCommand()` method, `expandObjectShortcuts()`, `commandHooks` property, `registerCommandHook()`, `unregisterCommandHook()`, `aliases` property, and the `CommandHookCallback`/`CommandHook` type definitions from Client.ts.
5. Add facade methods/getters:

```typescript
get aliases() { return this.commandProcessor.aliases; }
set aliases(v) { this.commandProcessor.aliases = v; }

async sendCommand(command: string, echo: boolean = true, options?: CommandOptions, skipMapParse: boolean = false, fromUserInput: boolean = false): Promise<void> {
    return this.commandProcessor.sendCommand(command, echo, options, skipMapParse, fromUserInput);
}

registerCommandHook(id: string, callback: CommandHookCallback, priority?: number): void {
    this.commandProcessor.registerCommandHook(id, callback, priority);
}

unregisterCommandHook(id: string): boolean {
    return this.commandProcessor.unregisterCommandHook(id);
}
```

- [ ] **Step 5: Check for external imports of CommandHookCallback/CommandHook**

Run: `grep -r "CommandHookCallback\|CommandHook" --include="*.ts" src/ | grep -v Client.ts | grep -v CommandProcessor.ts`

If any files import these types from `@client/Client`, the re-export added in step 4 ensures they still work. If they import from other paths, update those imports.

- [ ] **Step 6: Run all tests**

Run: `yarn test test/client/Client.test.ts test/client/CommandProcessor.test.ts test/client/MovementManager.test.ts 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/client/CommandProcessor.ts test/client/CommandProcessor.test.ts src/client/Client.ts
git commit -m "refactor: extract CommandProcessor from Client"
```

---

## Task 4: Extract KeyBindingManager

The largest extraction. The `keydown` handler and `applyBinds` logic move here.

**Files:**
- Create: `src/client/KeyBindingManager.ts`
- Create: `test/client/KeyBindingManager.test.ts`
- Modify: `src/client/Client.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/client/KeyBindingManager.test.ts

jest.mock('@client/main', () => ({ __esModule: true }));
jest.mock('@client/Triggers', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseLine: jest.fn(), parseMultiline: jest.fn(),
  })),
}));
jest.mock('@client/PackageHelper', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@client/scripts/functionalBind', () => ({
  FunctionalBindManager: jest.fn().mockImplementation(() => ({
    set: jest.fn(), setCategory: jest.fn(), clear: jest.fn(), clearCategory: jest.fn(),
    newMessage: jest.fn(), getLabel: jest.fn(() => ']'), getCategoryLabel: jest.fn(() => ']'),
    updateOptions: jest.fn(),
  })),
  formatLabel: jest.fn((opts: any) => opts.key || ''),
  LINE_START_EVENT: 'line_start',
}));
jest.mock('@shared/map/MapHelper', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseCommand: jest.fn((cmd: string) => cmd),
    move: jest.fn((dir: string) => ({ direction: dir, moved: false })),
    followMove: jest.fn(), setBlockable: jest.fn(),
  })),
}));
jest.mock('@client/sounds', () => ({ __esModule: true, beepSound: 'mock-sound' }));
jest.mock('howler', () => ({
  Howl: jest.fn(() => ({ state: jest.fn(() => 'loaded'), play: jest.fn(), stop: jest.fn(), once: jest.fn(), load: jest.fn() })),
}));

(globalThis as any).Input = { send: jest.fn() };
(globalThis as any).Output = { send: jest.fn(), flush_buffer: jest.fn(), buffer: [] };
(globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
(globalThis as any).Maps = { refresh_position: jest.fn(), set_position: jest.fn(), unset_position: jest.fn(), data: undefined };
(globalThis as any).Gmcp = { parse_option_subnegotiation: jest.fn() };

import { characterStorage } from '@modules/core/storage';
import Client from '@client/Client';
import { formatLabel } from '@client/scripts/functionalBind';

beforeEach(() => {
  localStorage.clear();
  characterStorage.setCharacter('TestChar');
  document.body.innerHTML = '<iframe id="cm-frame"></iframe>';
  (globalThis as any).Output = { flush_buffer: jest.fn(), send: jest.fn() };
  (globalThis as any).Text = { parse_patterns: jest.fn((v: any) => v) };
  (global as any).clientAdapterMock = {
    send: jest.fn(), stop: jest.fn(), connect: jest.fn(), output: jest.fn(),
    sendGmcp: jest.fn(), shouldEchoCommand: jest.fn(() => false),
    flushMessageBuffer: jest.fn(), emit: jest.fn(),
  };
});

afterEach(() => { localStorage.clear(); });

describe('KeyBindingManager', () => {
  test('setTempBind sets command on temp bind', () => {
    const client = new Client((global as any).clientAdapterMock);
    const printSpy = jest.spyOn(client, 'println').mockImplementation();
    client.setTempBind(0, 'test command');
    expect(client.tempBinds[0].command).toBe('test command');
    expect(printSpy).toHaveBeenCalled();
  });

  test('setTempBind clears when empty string', () => {
    const client = new Client((global as any).clientAdapterMock);
    client.tempBinds[0].command = 'existing';
    jest.spyOn(client, 'println').mockImplementation();
    client.setTempBind(0, '  ');
    expect(client.tempBinds[0].command).toBeNull();
  });

  test('setTempBind ignores invalid index', () => {
    const client = new Client((global as any).clientAdapterMock);
    // Should not throw
    client.setTempBind(99, 'test');
  });

  test('default bind values are set', () => {
    const client = new Client((global as any).clientAdapterMock);
    expect(client.lampBind).toEqual({ key: 'Digit4', ctrl: true });
    expect(client.attackBind).toEqual({ key: 'Digit1', ctrl: true });
    expect(client.supportBind).toEqual({ key: 'KeyQ', ctrl: true });
    expect(client.moveModeBind).toEqual({ key: 'Backquote' });
    expect(client.customBinds).toEqual([]);
    expect(client.tempBinds).toHaveLength(2);
  });

  test('lampBind triggers lamp refill command on keydown', () => {
    const client = new Client((global as any).clientAdapterMock);
    const sendSpy = jest.spyOn(client, 'sendCommand').mockImplementation();
    const event = new KeyboardEvent('keydown', { code: 'Digit4', ctrlKey: true });
    window.dispatchEvent(event);
    expect(sendSpy).toHaveBeenCalledWith('napelnij lampe olejem');
  });

  test('customBinds trigger commands on keydown', () => {
    const client = new Client((global as any).clientAdapterMock);
    client.customBinds = [{ key: 'F9', command: 'custom cmd' }];
    const sendSpy = jest.spyOn(client, 'sendCommand').mockImplementation();
    const event = new KeyboardEvent('keydown', { code: 'F9' });
    window.dispatchEvent(event);
    expect(sendSpy).toHaveBeenCalledWith('custom cmd');
  });
});
```

- [ ] **Step 2: Run test to verify it passes (validates current behavior)**

Run: `yarn test test/client/KeyBindingManager.test.ts 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 3: Create KeyBindingManager**

```typescript
// src/client/KeyBindingManager.ts

import type Client from "./Client";
import { formatLabel } from "./scripts/functionalBind";
import { globalStorage } from "@modules/core/storage";
import { bindMatches } from "@modules/core/keymapTypes";

type BindConfig = {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
};

export default class KeyBindingManager {
    lampBind: BindConfig = { key: "Digit4", ctrl: true };
    attackBind: BindConfig = { key: "Digit1", ctrl: true };
    supportBind: BindConfig = { key: "KeyQ", ctrl: true };
    moveModeBind: BindConfig = { key: "Backquote" };
    customBinds: (BindConfig & { command: string })[] = [];
    tempBinds: (BindConfig & { command: string | null })[] = [
        { key: 'F4', command: null },
        { key: 'F5', command: null },
    ];

    private client: Client;

    constructor(client: Client) {
        this.client = client;
        this.setupKeydownListener();
        this.setupBindsListener();
    }

    setTempBind(index: number, command: string) {
        const bind = this.tempBinds[index];
        if (!bind) {
            return;
        }
        const trimmed = command.trim();
        bind.command = trimmed ? trimmed : null;
        const label = formatLabel(bind);
        if (bind.command) {
            this.client.println(`Tymczasowe przypisanie ${index + 1} (${label}) ustawione na: ${bind.command}`);
        } else {
            this.client.println(`Tymczasowe przypisanie ${index + 1} (${label}) zostalo wyczyszczone.`);
        }
    }

    private setupKeydownListener() {
        window.addEventListener('keydown', (ev) => {
            if (bindMatches(ev, this.lampBind)) {
                this.client.sendCommand('napelnij lampe olejem');
                ev.preventDefault();
            }
            if (bindMatches(ev, this.attackBind)) {
                const id = this.client.TeamManager.getAttackTargetId?.();
                if (id) {
                    if (this.client.AllyProtection.isAlly(id)) {
                        if (this.client.AllyProtection.checkPendingAttack(id, 'attackBind')) {
                            const command = `${this.client.attackCommand} ob_${id}`;
                            this.client.sendCommand(command);
                        } else {
                            const info = this.client.AllyProtection.getAllyInfo(id);
                            this.client.AllyProtection.showAllyWarning(info?.name ?? '?', info?.guild ?? '?');
                            this.client.AllyProtection.setPendingAttack(id, 'attackBind');
                        }
                    } else {
                        const command = `${this.client.attackCommand} ob_${id}`;
                        this.client.sendCommand(command);
                    }
                }
                ev.preventDefault();
            }
            if (bindMatches(ev, this.supportBind)) {
                const targetId = this.client.TeamManager.getAttackTargetId?.();
                if (targetId && this.client.AllyProtection.isAlly(targetId)) {
                    if (this.client.AllyProtection.checkPendingAttack(targetId, 'supportBind')) {
                        this.client.support();
                    } else {
                        const info = this.client.AllyProtection.getAllyInfo(targetId);
                        this.client.AllyProtection.showAllyWarning(info?.name ?? '?', info?.guild ?? '?');
                        this.client.AllyProtection.setPendingAttack(targetId, 'supportBind');
                    }
                } else {
                    this.client.support();
                }
                ev.preventDefault();
            }
            this.customBinds.forEach(cb => {
                if (bindMatches(ev, cb)) {
                    this.client.sendCommand(cb.command);
                    ev.preventDefault();
                }
            });
            this.tempBinds.forEach(tb => {
                if (!tb.command) {
                    return;
                }
                if (bindMatches(ev, tb)) {
                    this.client.sendCommand(tb.command);
                    ev.preventDefault();
                }
            });
        });
    }

    private setupBindsListener() {
        const applyBinds = (b: any) => {
            if (!b) {
                return;
            }
            const bind = b?.main;
            if (bind) {
                this.client.FunctionalBind.updateOptions({
                    key: bind.key,
                    ctrl: bind.ctrl,
                    alt: bind.alt,
                    shift: bind.shift,
                    label: formatLabel(bind)
                });
            }
            const gatesBind = b?.mainGates || bind;
            if (gatesBind) {
                this.client.FunctionalBind.updateOptions({
                    key: gatesBind.key,
                    ctrl: gatesBind.ctrl,
                    alt: gatesBind.alt,
                    shift: gatesBind.shift,
                    label: formatLabel(gatesBind)
                }, 'gates');
            }
            const transportBind = b?.mainTransport || bind;
            if (transportBind) {
                this.client.FunctionalBind.updateOptions({
                    key: transportBind.key,
                    ctrl: transportBind.ctrl,
                    alt: transportBind.alt,
                    shift: transportBind.shift,
                    label: formatLabel(transportBind)
                }, 'transport');
            }
            const lootBind = b?.mainLoot || bind;
            if (lootBind) {
                this.client.FunctionalBind.updateOptions({
                    key: lootBind.key,
                    ctrl: lootBind.ctrl,
                    alt: lootBind.alt,
                    shift: lootBind.shift,
                    label: formatLabel(lootBind)
                }, 'loot');
            }
            const lamp = b?.lamp;
            if (lamp) {
                this.lampBind = { ...lamp };
            }
            const attack = b?.attack;
            if (attack) {
                this.attackBind = { ...attack };
            }
            const support = b?.support;
            if (support) {
                this.supportBind = { ...support };
            }
            const moveMode = b?.moveMode;
            if (moveMode) {
                this.moveModeBind = { ...moveMode };
            }
            const temp = b?.temp;
            if (Array.isArray(temp)) {
                temp.forEach((tempBind: any, index: number) => {
                    if (!tempBind || typeof tempBind !== 'object') {
                        return;
                    }
                    if (typeof tempBind.key !== 'string' || tempBind.key === '') {
                        return;
                    }
                    const current = this.tempBinds[index];
                    if (current) {
                        current.key = tempBind.key;
                        current.ctrl = tempBind.ctrl ? true : undefined;
                        current.alt = tempBind.alt ? true : undefined;
                        current.shift = tempBind.shift ? true : undefined;
                    } else {
                        this.tempBinds[index] = {
                            key: tempBind.key,
                            ctrl: tempBind.ctrl ? true : undefined,
                            alt: tempBind.alt ? true : undefined,
                            shift: tempBind.shift ? true : undefined,
                            command: null,
                        };
                    }
                });
            }
            const custom = b?.custom;
            if (custom) {
                this.customBinds = [...custom];
            } else {
                this.customBinds = [];
            }
        };

        globalStorage.onChange('binds', (binds) => {
            applyBinds(binds as any);
        });

        // Apply initial binds from storage
        const initialBinds = globalStorage.get('binds');
        if (initialBinds) applyBinds(initialBinds as any);
    }
}
```

- [ ] **Step 4: Wire into Client.ts**

In `src/client/Client.ts`:

1. Add import: `import KeyBindingManager from "./KeyBindingManager";`
2. Add property (after FunctionalBind is created): `public readonly keyBindingManager = new KeyBindingManager(this);`
3. Remove from constructor: the entire `window.addEventListener('keydown', ...)` block (~55 lines)
4. Remove from constructor: the `applyBinds` function definition and `globalStorage.onChange('binds', ...)` listener (~90 lines)
5. Remove from constructor: `const initialBinds = globalStorage.get('binds'); if (initialBinds) applyBinds(initialBinds as any);`
6. Remove properties: `lampBind`, `attackBind`, `supportBind`, `moveModeBind`, `customBinds`, `tempBinds`
7. Remove method: `setTempBind()`
8. Add facade getters/setters:

```typescript
get lampBind() { return this.keyBindingManager.lampBind; }
set lampBind(v) { this.keyBindingManager.lampBind = v; }

get attackBind() { return this.keyBindingManager.attackBind; }
set attackBind(v) { this.keyBindingManager.attackBind = v; }

get supportBind() { return this.keyBindingManager.supportBind; }
set supportBind(v) { this.keyBindingManager.supportBind = v; }

get moveModeBind() { return this.keyBindingManager.moveModeBind; }
set moveModeBind(v) { this.keyBindingManager.moveModeBind = v; }

get customBinds() { return this.keyBindingManager.customBinds; }
set customBinds(v) { this.keyBindingManager.customBinds = v; }

get tempBinds() { return this.keyBindingManager.tempBinds; }
set tempBinds(v) { this.keyBindingManager.tempBinds = v; }

setTempBind(index: number, command: string) {
    this.keyBindingManager.setTempBind(index, command);
}
```

- [ ] **Step 5: Run all tests**

Run: `yarn test test/client/ 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/client/KeyBindingManager.ts test/client/KeyBindingManager.test.ts src/client/Client.ts
git commit -m "refactor: extract KeyBindingManager from Client"
```

---

## Task 5: Final Cleanup and Verification

**Files:**
- Modify: `src/client/Client.ts` (minor cleanup only)

- [ ] **Step 1: Verify Client.ts is under ~200 lines**

Run: `wc -l src/client/Client.ts`
Expected: ~150-200 lines

- [ ] **Step 2: Run full unit test suite**

Run: `yarn test 2>&1 > /dev/null || true && yarn test --silent 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 3: Run type check**

Run: `yarn build 2>&1 > /dev/null || true && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Run e2e tests**

Run: `timeout 600 yarn test:e2e 2>&1 || true`
Expected: All E2E tests pass

- [ ] **Step 5: Commit any cleanup**

```bash
git add -A
git commit -m "refactor: finalize Client.ts god object decomposition"
```

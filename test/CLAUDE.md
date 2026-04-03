# Unit Tests

Unit tests use **Jest** with a **jsdom** environment. Configuration is in `jest.config.cjs`.

## Structure

Tests mirror the `src/` directory structure:

```
test/
├── __mocks__/                    # Shared mock modules
│   ├── mudlet-map-renderer.js   # Mock for Konva-based map renderer
│   └── wasmUrlMock.js           # Mock for sql.js WASM URL imports
├── client/                       # Tests for src/client/
│   ├── helpers/                  # Test utilities (testSettings.ts, herbClient.ts)
│   ├── ansi/                    # ANSI parser tests
│   ├── scripts/                 # Script-related tests
│   ├── utils/                   # Utility tests
│   └── *.test.ts                # Client module tests
├── modules/                      # Tests for src/modules/
│   ├── core/                    # Storage, events, cross-tab tests
│   ├── data/                    # DataStore and strategy tests
│   └── firebase/                # Crypto, sync, type tests
└── web/                          # Tests for src/web/
    ├── dataStores/              # Data store tests
    ├── options/                 # Settings UI tests
    └── *.test.ts                # Component and utility tests
```

## Conventions

- **File naming**: `{SourceFileName}.test.ts` matching the source file name
- **Location**: Place test files in the directory that mirrors the source module
- **Path aliases**: Same aliases as source code (`@client`, `@web`, `@shared`, `@modules`, `@web-ui`)

## Global Setup (`jest.setup.js`)

The setup file provides these globals automatically:
- **IndexedDB**: In-memory via `fake-indexeddb/auto`
- **crypto.subtle**: From Node's `webcrypto` (needed for encryption tests)
- **localStorage**: Custom in-memory mock with standard API
- **ResizeObserver**: No-op mock
- **structuredClone**: JSON round-trip fallback
- **fetch**: Mock returning default game data response
- **pako**: Mock for MCCP decompression (Inflate/inflate/ungzip)

Pre-configured module mocks:
- `mudlet-map-renderer` → `test/__mocks__/mudlet-map-renderer.js`
- `@modules/data/peopleStore` → mock with `subscribe`, `refresh`, `forceRefresh`, `clear`

## Common Patterns

### Mocking the Client

```typescript
const clientMock = {
  send: jest.fn(),
  stop: jest.fn(),
  connect: jest.fn(),
  output: jest.fn(),
  sendGmcp: jest.fn(),
  shouldEchoCommand: jest.fn(() => false),
  flushMessageBuffer: jest.fn(),
  emit: jest.fn(),
};
const client = new Client(clientMock as any);
```

### Storage Testing

```typescript
// Character-scoped storage
characterStorage.setCharacter('Alice');
characterStorage.set('settings', { shortenExits: true });
expect(localStorage.getItem('Alice:settings')).toBe('{"shortenExits":true}');

// Global storage (no character prefix)
globalStorage.set('triggers', [...]);
```

Always call `localStorage.clear()` in `beforeEach` to isolate tests.

### Test Settings Helper

```typescript
import { setTestSettings } from './helpers/testSettings';

setTestSettings({ shortenExits: true, collectMode: 2 });
```

### Fake Timers

```typescript
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// Advance time
jest.advanceTimersByTime(1000);
```

### Module Re-import Pattern

When testing modules with side effects or cached state:

```typescript
beforeEach(() => jest.resetModules());

test('loads fresh module', async () => {
  const module = await import('@web/dataStores/someStore');
  // module has fresh state
});
```

## Running Tests

```bash
yarn test                          # Run all unit tests
yarn test -- --watch               # Watch mode
yarn test -- Triggers              # Run tests matching "Triggers"
yarn test -- --testPathPattern=client  # Run only client/ tests
yarn test:coverage                 # Generate coverage report
```

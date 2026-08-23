# End-to-End Tests

E2E tests use **Playwright** with **Chromium**. Configuration is in `playwright.config.ts`.

Tests run against a live Vite dev server on `http://127.0.0.1:4173`. The server starts automatically when running tests.

## Running the whole suite locally

The full suite is ~740 tests and takes roughly **20 minutes**. Two things in the
config are tuned for CI and get in the way locally:

**`globalTimeout` is 10 minutes** — a cap on the entire run, not per test. Past it,
Playwright kills the run and reports the remainder as "did not run", plus messages
like `Timed out waiting 600s for the plugin setup to run`. Those read like failures
but mean "the clock ran out". Pass `--global-timeout=0` for a local full run:

```bash
npx playwright test --global-timeout=0
```

**Port 4173 is hardcoded with `--strictPort`.** Repeated full runs leave thousands of
sockets in `TIME_WAIT` against it — Windows only has 16384 ephemeral ports, so
after a few runs new connections fail with `net::ERR_ADDRESS_IN_USE` and the
webServer times out. They take a while to drain. Either wait, or point the run at
another port.

**Wall time is the tell for spurious failures.** A healthy local full run is about
19 minutes. When it stretches past ~22 — another build running, a busy machine —
expect a scattering of 10-16 failures across specs that have nothing to do with each
other or with what you changed, all of which pass when re-run in isolation. Observed
three times; every time the code was fine. Before investigating such a list, re-run
the failures with `--workers=1`: if they pass, it was contention.

Do not run anything else while a full suite is going, `npx tsc --noEmit` included.

Prefer running the specs that cover what changed over the whole suite; CI shards it
8 ways on clean runners, which is where a full green is actually established.

## Structure

```
e2e/
├── support/                      # Shared test infrastructure
│   ├── fixtures.ts              # Base test fixture (extends Playwright)
│   ├── mocks.ts                 # WebSocket mock, API mocks, game helpers (~880 lines)
│   ├── firebase-mocks.ts       # Firebase mock infrastructure (~320 lines)
│   ├── firebase-fixtures.ts    # Firebase-specific test fixture
│   └── mock-data/              # JSON/text data for API responses
│       ├── map-data.json       # Map areas with rooms and exits
│       ├── map-colors.json     # Environment color definitions
│       ├── npc-data.json       # NPCs with location IDs
│       ├── people-database.txt # Base64-encoded SQLite DB
│       ├── magics-data.json    # Magic spell definitions
│       ├── magic-keys-data.json
│       ├── knowledge-data.json
│       └── wiedza-data.json
└── *.spec.ts                    # Test specs (flat directory, ~100 files)
```

## Testing Philosophy

**Always test from the user's perspective.** E2E tests simulate real user behavior:
- Interact through the UI: click buttons, type in inputs, open menus
- **Never** dispatch events directly, call internal functions, or manipulate DOM state programmatically
- Use `page.locator()`, `page.click()`, `page.fill()`, `page.getByRole()`, etc.
- The only exceptions are game server simulation helpers (`pushGmcp`, `pushText`) which mock the server side, not the client

**Settings must be changed through the settings modal**, never by writing to
`localStorage`. Writing storage directly skips the options UI, the save handler and
the change listeners — so the test passes even when the path a user actually takes is
broken, which is the opposite of what an e2e test is for. Reuse the helpers in
`support/options.ts` (`openWalkaTab`, `setGagMode`, `saveOptions`, …).

Reading `localStorage` in an assertion is fine — that verifies what the UI persisted.
It is only *writing* it as setup that defeats the point.

If a feature can't be tested through user-visible UI interactions, that's a sign the
test needs rethinking, not that you should reach into internals.

## Conventions

- **File naming**: `{feature-name}.spec.ts` — one spec file per feature, kebab-case
- **Location**: All specs are in the `e2e/` root (flat, no subdirectories)
- **Imports**: Always import `test` and `expect` from `./support/fixtures` (not from `@playwright/test` directly) — this ensures all mocks are installed

```typescript
import { test, expect } from './support/fixtures';
```

For Firebase-related tests:
```typescript
import { test, expect } from './support/firebase-fixtures';
```

## Fixtures (`support/fixtures.ts`)

The custom fixture extends Playwright's base test to automatically:
1. Block Google Analytics requests
2. Disable GA and Firebase via `window.__DISABLE_GA__` and `window.__DISABLE_FIREBASE__`
3. Install mock WebSocket (replaces `window.WebSocket`)
4. Mock all external API endpoints (map, NPCs, people, magics, knowledge, etc.)

## Key Helpers (`support/mocks.ts`)

### Game Connection

```typescript
await ensureGameSocket(page);      // Connect to mock game socket
await waitForCommandInput(page);   // Wait for command input field to be ready
```

### Sending Game Data (Server → Client)

```typescript
await pushGmcp(page, 'char.info', { name: 'Tester', guild: 'warriors' });
await pushText(page, 'You see a goblin here.');
await pushText(page, 'colored text', { type: 'prompt' });
```

### Sending Commands (Client → Server)

```typescript
await submitCommand(page, 'attack goblin');
const cmd = await getLastOutgoingCommand(page);
const allCmds = await getCommandLog(page);
await resetCommandLog(page);
```

### Output Verification

```typescript
await waitForOutputContaining(page, 'goblin');
const output = await getRecentOutput(page, 5);
```

### Character Setup

```typescript
await primeCharInfo(page, { name: 'Tester' });
```

### Map

```typescript
await waitForMapReady(page);
```

### API Mock Overrides

Default mocks are installed by the fixture. To override with custom data:

```typescript
await mockNpcDownload(context, customNpcData);
await mockMapDownloads(context, { mapData: customMapData });
```

## Firebase Helpers (`support/firebase-mocks.ts`)

```typescript
import { DEFAULT_MOCK_USER, MOCK_DEVICE_1 } from './firebase-mocks';

await setMockUser(page, DEFAULT_MOCK_USER);
await setMockDeviceId(page, MOCK_DEVICE_1.id);
await setCloudData(page, 'test-user-123', { categories: { triggers: {...} } });
await enableFirebaseSettings(page, { autoSync: true });
await waitForFirebaseWrite(page);
const data = await getCloudData(page, 'test-user-123');
```

## Common Test Pattern

```typescript
import { test, expect } from './support/fixtures';
import { ensureGameSocket, waitForCommandInput, pushGmcp, pushText, submitCommand } from './support/mocks';

test('feature description', async ({ page }) => {
  await page.goto('/');
  await waitForCommandInput(page);
  await ensureGameSocket(page);

  // Setup game state
  await pushGmcp(page, 'char.info', { name: 'Tester' });

  // Interact
  await submitCommand(page, 'look');

  // Verify
  await expect(page.locator('#some-element')).toBeVisible();
});
```

## GMCP Path Constants

Use the exported constants from `mocks.ts` for standard GMCP paths:

```typescript
import { GMCP_PATHS } from './support/mocks';
// GMCP_PATHS.CHAR_INFO, GMCP_PATHS.OBJECTS_DATA, GMCP_PATHS.ROOM_INFO, etc.
```

## Running Tests

```bash
yarn test:e2e                                    # Run all e2e tests
yarn test:e2e e2e/some-feature.spec.ts           # Run a single spec
yarn test:e2e -- --headed                        # Show browser window
yarn test:e2e -- --debug                         # Debug mode (step through)
yarn test:e2e -- --shard=1/8                     # Run one CI shard locally
yarn test:e2e -- --grep "feature description"    # Filter by test name
```

## CI Notes

- Tests run across **8 parallel shards** in CI
- **2 retries** on failure in CI, 0 locally
- Traces are collected on first retry for debugging
- Screenshots are captured only on failure
- Global timeout: 10 minutes

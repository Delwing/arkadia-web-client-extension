# End-to-End Tests

E2E tests use **Playwright** with **Chromium**. Configuration is in `playwright.config.ts`.

Tests run against a live Vite dev server on `http://127.0.0.1:4173`. The server starts automatically when running tests.

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

If a feature can't be tested through user-visible UI interactions, that's a sign the test needs rethinking, not that you should reach into internals.

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
yarn test:e2e -- --shard=1/12                    # Run one CI shard locally
yarn test:e2e -- --grep "feature description"    # Filter by test name
```

## CI Notes

- Tests run across **12 parallel shards** in CI, **2 workers** each
- **2 retries** on failure in CI, 0 locally
- Traces are collected on first retry for debugging
- Screenshots are captured only on failure
- Per-test timeout: 30 seconds; per-assertion: 10 seconds; global: 20 minutes
- Tests that pass only on a retry are listed under "Flaky e2e tests" in the run summary

## Specs that need the public internet

A handful of specs exercise data the client fetches from a third-party repository
at runtime, above all `HERBS_URL` in `src/modules/data/dataStores/herbsStore.ts`:

```
https://raw.githubusercontent.com/tjurczyk/arkadia-data/.../herbs_data.json
```

In a sandboxed agent container the shell can usually reach that host (curl goes
through the agent proxy) while **Chromium cannot** - it does not inherit
`HTTPS_PROXY`, so the in-page `fetch` fails outright. The herb store then never
populates and the specs below sit on a `waitForFunction` until the 30s per-test
timeout, while every other test in the same file passes in about 2s:

- `character-switch-data.spec.ts` - "herbs are cleared when switching..." and
  "herbs restore when switching back..."
- `herbs.spec.ts` - "give panel hands herbs from the basket to a team member"

**These are not flaky tests and there is nothing to fix in them.** They are green
in CI, where the runner has direct network access. Three separate sessions have
now each spent time re-discovering this, which is why it is written down.

If you see exactly-30s timeouts in herb-related specs locally, confirm the cause
rather than changing the test:

```bash
node -e "..." # or simply: curl -sS -o /dev/null -w '%{http_code}\n' "$HERBS_URL"
```

A shell that gets 200 while the browser reports `Failed to fetch` is this, and
nothing else. Run those specs on CI.

Worth knowing separately: because the suite fetches that URL for real, a CI run
also depends on that third-party repository being reachable. Stubbing the route
in `support/fixtures.ts` would remove the dependency, at the cost of no longer
exercising the real fetch-and-parse path. Not done here - it is a deliberate
trade-off, not an oversight.

## Timing Budget

GitHub's runners have 4 vCPUs, so a worker there gets a fraction of the CPU a
laptop gives it. A test that takes 6s locally can take three times that in CI.
Two rules follow:

- **Don't tighten the per-test timeout to "what it takes locally."** The deadline
  exists to catch a hang, not to enforce a speed limit. A timeout only costs time
  on a test that is already failing.
- **Keep helper timeouts under the test timeout.** A helper that waits longer than
  the test budget can never report its own failure — the test dies first and you
  get "Target page, context or browser has been closed" instead of "the map never
  rendered." Boot steps in `mocks.ts` share a single `BOOT_STEP_TIMEOUT`.

## Waiting Without Sleeping

`page.waitForTimeout(n)` is a bet that the machine is fast enough. It is the right
tool in exactly one case: asserting that something did **not** happen (a suppressed
scroll, a long-press that must not fire early). Everywhere else, wait for the state
you actually want:

- Debounced writes to layout storage: `waitForLayoutSaved(page)` — it watches the
  stored value and returns once it stops changing, so a slow runner just waits longer.
- Anything rendered: `expect(locator)` auto-retries; `expect.poll` for derived values.

Don't reach for a blanket `* { transition: none; animation: none }` init script. The
fixture kills modal transitions specifically because nothing depends on them, but
`MobileCommandRadial` gates a `display:none` on `transitionend` and `pipeStatus`
lands its smoke on `animationiteration` — switching animations off globally would
stall both and trade one flake for two.

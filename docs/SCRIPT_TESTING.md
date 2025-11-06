# Script Testing Guide

## Overview

This guide describes the recommended approach for testing scripts that integrate with the Client. Instead of heavily mocking the Client's internal APIs, we create a real Client instance and mock only the external boundary (ClientAdapter).

## Why This Approach?

### Traditional Mocking Problems

The old approach had several issues:

```typescript
// ❌ OLD APPROACH - Heavy mocking
const mockClient = {
  Triggers: {
    registerTrigger: jest.fn(),
    parseLine: jest.fn((line) => line),  // Mock behavior
  },
  OutputHandler: { makeClickable: jest.fn() },
  on: jest.fn(),
  // ... dozens of methods to mock
};
```

**Problems:**
- Tests break when internal APIs change
- Mocks don't behave like real code
- Hard to maintain as Client evolves
- Doesn't test real integration
- Requires understanding implementation details

### Real Client Benefits

```typescript
// ✅ NEW APPROACH - Real Client
const client = new Client(mockAdapter, mockPort);
initPackageHelper(client);

const results = client.onLine('Wypisano na niej duzymi literami: Bob', '');
expect(results[0].text).toContain('Bob');
```

**Benefits:**
- Tests actual code paths
- Breaks only when behavior changes
- Easy to maintain
- Tests real integration
- Clear test intent
- Automatically works with AnsiAwareBuffer

## The Testing Pattern

### 1. Basic Setup

```typescript
import initYourScript from '@client/scripts/yourScript';
import Client from '@client/Client';
import type { ClientAdapter } from '@client/Client';

describe('YourScript with real Client', () => {
  let client: Client;
  let mockAdapter: jest.Mocked<ClientAdapter>;
  let mockPort: any;

  beforeEach(() => {
    // Mock only the external boundary
    mockAdapter = {
      send: jest.fn(),
      output: jest.fn(),
      sendGmcp: jest.fn(),
      parseAnsiPatterns: jest.fn((text: string) => text),
      flushMessageBuffer: jest.fn(),
      emit: jest.fn(),
    };

    // Mock port (minimal)
    mockPort = {
      postMessage: jest.fn(),
      onMessage: {
        addListener: jest.fn(),
      },
    };

    // Create REAL Client instance
    client = new Client(mockAdapter, mockPort);

    // Mock any dependencies your script needs
    client.Map.currentRoom = { id: 123 } as any;
    client.Map.findPath = jest.fn((from, to) => [from, to]);

    // Initialize your script
    initYourScript(client);
  });

  // ... tests here
});
```

### 2. Basic Test Pattern

```typescript
test('processes MUD line correctly', () => {
  // Process line as it comes from MUD
  const results = client.onLine('Some MUD output', '');

  // Verify output
  expect(results).toHaveLength(1);
  expect(results[0].text).toContain('expected content');
});
```

### 3. Testing Color/Formatting

```typescript
test('colors text appropriately', () => {
  const results = client.onLine('Wypisano na niej duzymi literami: Bob', '');

  expect(results).toHaveLength(1);
  const segments = results[0].getSegments();

  // Check that 'Bob' is colored
  expect(segments.some(seg =>
    seg.text.includes('Bob') && seg.state?.foreground
  )).toBe(true);
});
```

### 4. Testing Multi-step Scenarios

```typescript
test('package delivery flow', () => {
  // Step 1: Process label line to set current package
  const labelResults = client.onLine(
    'Wypisano na niej duzymi literami: Bob',
    ''
  );
  expect(labelResults[0].text).toContain('Bob');

  // Step 2: Trigger delivery success
  const deliveryResults = client.onLine(
    'Bob usmiecha sie i bierze od ciebie paczke.',
    ''
  );
  expect(deliveryResults[0].text).toContain('Bob');
});
```

### 5. Testing Event System

```typescript
test('responds to events', () => {
  // Set up initial state
  client.onLine('Some setup line', '');

  // Trigger an event
  client.sendEvent('enterLocation', { id: 456 });

  // Verify script responded (e.g., check FunctionalBind was updated)
  // Note: You may need to spy on methods to verify internal behavior
});
```

### 6. Testing Commands

```typescript
test('processes user commands', () => {
  const sendSpy = jest.spyOn(mockAdapter, 'send');

  // User types a command
  client.sendCommand('wybierz paczke 1');

  // Verify command was sent to MUD
  expect(sendSpy).toHaveBeenCalled();
});
```

## Understanding `client.onLine()`

The `onLine()` method is the **real entry point** for all MUD output:

```typescript
onLine(line: string, type: string): AnsiAwareBuffer[]
```

**What it does:**
1. Converts string to AnsiAwareBuffer
2. Triggers `LINE_START_EVENT`
3. Processes through multiline triggers
4. Splits lines on `\n`
5. Processes each line through regular triggers
6. Returns array of processed buffers

**Why use it:**
- Most realistic - this is exactly what happens in production
- Tests complete pipeline, not just one trigger
- Handles multiline scenarios automatically
- Returns `AnsiAwareBuffer[]` - the actual output format

## Common Patterns

### Testing Table Processing

```typescript
test('processes table data', () => {
  // Send table header to activate parsing
  client.onLine(' +-----+-------+', '');

  // Send table row
  const results = client.onLine(' | 1. Alice |', '');

  expect(results[0].text).toContain('Alice');
});
```

### Testing Trigger Activation/Deactivation

```typescript
test('trigger activates only in context', () => {
  // Outside context - no modification
  const before = client.onLine('Some text', '');
  expect(before[0].text).toBe('Some text');

  // Activate context
  client.onLine('START_MARKER', '');

  // Inside context - modified
  const during = client.onLine('Some text', '');
  expect(during[0].text).not.toBe('Some text');

  // Deactivate context
  client.onLine('END_MARKER', '');

  // Outside context again
  const after = client.onLine('Some text', '');
  expect(after[0].text).toBe('Some text');
});
```

### Testing with External Data

```typescript
test('uses NPC data store', async () => {
  // Mock external data store
  const { addLocalNpc } = await import('../../src/web/dataStores/npcStore');
  await addLocalNpc({ name: 'TestNPC', loc: 123 });

  // Re-initialize script to pick up data
  initYourScript(client);

  // Process line referencing NPC
  const results = client.onLine('TestNPC is here', '');

  // Verify NPC was recognized (colored, distance calculated, etc.)
  expect(results[0].text).toContain('TestNPC');
});
```

## Mocking Dependencies

### Map Integration

```typescript
beforeEach(() => {
  client.Map.currentRoom = { id: 123 } as any;
  client.Map.findPath = jest.fn((from, to) => {
    if (from === to) return [from];
    return [from, to];  // Distance = 1
  });
});
```

### Settings/Configuration

```typescript
beforeEach(() => {
  // Simulate settings event
  client.sendEvent('uiSettings', {
    packageHelperEnabled: true,
    enemyGuilds: ['BAD_GUILD'],
  });
});
```

### Storage/Persistence

```typescript
beforeEach(() => {
  // Mock storage responses
  client.on('storage', (data) => {
    // Your mock storage handler
  });
});
```

## What to Test

### ✅ DO Test:

1. **Output transformation** - Does the line get modified correctly?
2. **Color application** - Are the right parts colored?
3. **Multi-line flows** - Do sequential lines work together?
4. **Event responses** - Does the script respond to events?
5. **Edge cases** - Empty strings, special characters, etc.

### ❌ DON'T Test:

1. **Internal state** - Don't peek inside script internals
2. **Implementation details** - Don't test how it works, test what it does
3. **Client internals** - Don't test that Triggers work (they already do)

## Best Practices

### 1. Test Behavior, Not Implementation

```typescript
// ❌ BAD - Tests implementation
test('registers trigger with correct regex', () => {
  expect(client.Triggers.registerTrigger).toHaveBeenCalledWith(
    /some regex/,
    expect.any(Function)
  );
});

// ✅ GOOD - Tests behavior
test('colors names in package list', () => {
  const results = client.onLine(' | 1. Bob |', '');
  const segments = results[0].getSegments();
  expect(segments.some(seg => seg.text === 'Bob' && seg.state?.foreground)).toBe(true);
});
```

### 2. Use Realistic MUD Output

```typescript
// ❌ BAD - Synthetic test data
test('handles name', () => {
  const results = client.onLine('NAME', '');
  // ...
});

// ✅ GOOD - Real MUD output
test('handles label line', () => {
  const results = client.onLine(
    'Wypisano na niej duzymi literami: Bob',
    ''
  );
  // ...
});
```

### 3. Test Observable Effects

```typescript
// ✅ GOOD - Test what user sees
test('delivery success shows message', () => {
  client.onLine('Wypisano na niej duzymi literami: Bob', '');

  const results = client.onLine(
    'Bob usmiecha sie i bierze od ciebie paczke.',
    ''
  );

  // User sees Bob's name
  expect(results[0].text).toContain('Bob');
});
```

### 4. Keep Tests Independent

```typescript
// ✅ GOOD - Each test is independent
test('test A', () => {
  const results = client.onLine('line1', '');
  expect(results[0].text).toContain('line1');
});

test('test B', () => {
  // Fresh client from beforeEach
  const results = client.onLine('line2', '');
  expect(results[0].text).toContain('line2');
});
```

## Complete Example

Here's a full example testing a package delivery script:

```typescript
import initPackageHelper from '@client/PackageHelper';
import Client from '@client/Client';
import type { ClientAdapter } from '@client/Client';

describe('PackageHelper with real Client', () => {
  let client: Client;
  let mockAdapter: jest.Mocked<ClientAdapter>;
  let mockPort: any;

  beforeEach(() => {
    // Setup ClientAdapter mock
    mockAdapter = {
      send: jest.fn(),
      output: jest.fn(),
      sendGmcp: jest.fn(),
      parseAnsiPatterns: jest.fn((text: string) => text),
      flushMessageBuffer: jest.fn(),
      emit: jest.fn(),
    };

    // Setup port mock
    mockPort = {
      postMessage: jest.fn(),
      onMessage: { addListener: jest.fn() },
    };

    // Create real Client
    client = new Client(mockAdapter, mockPort);

    // Setup dependencies
    client.Map.currentRoom = { id: 123 } as any;
    client.Map.findPath = jest.fn((from, to) => {
      if (from === to) return [from];
      return [from, to];
    });

    // Initialize script
    initPackageHelper(client);
  });

  test('colors recipient name in package label', () => {
    const line = 'Wypisano na niej duzymi literami: Bob';
    const results = client.onLine(line, '');

    expect(results).toHaveLength(1);
    expect(results[0].text).toContain('Bob');

    const segments = results[0].getSegments();
    expect(segments.some(seg =>
      seg.text.includes('Bob') && seg.state?.foreground
    )).toBe(true);
  });

  test('handles package delivery confirmation', () => {
    // Setup: Process label to establish current package
    client.onLine('Wypisano na niej duzymi literami: Bob', '');

    // Action: Process delivery confirmation
    const results = client.onLine(
      'Bob usmiecha sie i bierze od ciebie paczke.',
      ''
    );

    // Verify: Line processed correctly
    expect(results).toHaveLength(1);
    expect(results[0].text).toContain('Bob');
    expect(results[0].text).toContain('paczke');
  });

  test('processes package table', () => {
    // Activate table parsing
    client.onLine(' +-----+-------+', '');

    // Process package row
    const results = client.onLine(' | 1. Bob |', '');

    expect(results).toHaveLength(1);
    expect(results[0].text).toContain('Bob');
  });
});
```

## Migration Guide

### Converting Old Tests

**Old approach:**
```typescript
test('old test', () => {
  const triggerLine = new TriggerLine('text');
  const callback = mockClient.Triggers.registerTrigger.mock.calls[0][1];
  const result = callback(triggerLine);
  expect(result.toAnsiString()).toBe('expected');
});
```

**New approach:**
```typescript
test('new test', () => {
  const results = client.onLine('text', '');
  expect(results[0].text).toBe('expected');
});
```

### Steps to Migrate

1. Replace mock Client with `new Client(mockAdapter, mockPort)`
2. Replace direct trigger calls with `client.onLine()`
3. Replace `TriggerLine` with string input
4. Replace `.toAnsiString()` with `.text`
5. Replace color checks with `.getSegments()` checks
6. Remove internal API testing

## Troubleshooting

### Test fails with "Cannot read property of undefined"

**Cause:** Script depends on Client properties not set up in test.

**Fix:** Add missing mocks to `beforeEach()`:
```typescript
client.Map.currentRoom = { id: 123 } as any;
client.someOtherProperty = mockValue;
```

### Results array is empty

**Cause:** Multiline trigger returned `null` (suppressed output).

**Fix:** This may be expected behavior. Verify the trigger should produce output.

### Colors aren't being applied

**Cause:** Script may need activation context.

**Fix:** Send activation trigger before the test line:
```typescript
client.onLine('ACTIVATION_LINE', '');
const results = client.onLine('test line', '');
```

## Summary

**The Golden Rule:** Test scripts by simulating real MUD output through `client.onLine()`.

**Key Principles:**
- Create real Client, mock only ClientAdapter
- Use `onLine()` as entry point
- Test observable behavior, not implementation
- Keep tests simple and readable
- Use realistic MUD output

This approach provides reliable, maintainable tests that accurately reflect how scripts work in production.

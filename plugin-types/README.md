# @arkadia/plugin-types

TypeScript type definitions for developing Arkadia Web Client plugins.

## Installation

### Option 1: Install directly from tarball URL

```bash
npm install http://delwing.github.io/arkadia-web-client-extension/arkadia-plugin-types.tgz
```

This URL always serves the current types. Its contents change whenever the API
changes — which also changes the integrity hash your lockfile records, so an
install pinned to it will fail after the next API change.

**If your CI installs with `--frozen-lockfile`, pin the immutable copy instead.**
Every build also publishes the same tarball under a content-hashed name that can
never change:

```bash
npm install http://delwing.github.io/arkadia-web-client-extension/arkadia-plugin-types-1.0.0-<hash>.tgz
```

The hash is the package version — see it in `package.json` after installing, or
in the deploy log. Moving to newer types is then a deliberate re-pin rather than
something an unrelated release does to you.

### Option 2: Download the tarball

Download the latest `arkadia-plugin-types.tgz`:

```bash
# Download and extract
curl -O http://delwing.github.io/arkadia-web-client-extension/arkadia-plugin-types.tgz
tar -xzf arkadia-plugin-types.tgz

# Install as a local dependency
npm install ./package
```

### Option 3: Install from local development server

When running the local development server:

```bash
npm install http://localhost:3030/types/arkadia-plugin-types.tgz
```

### Option 4: Install from file system (development)

```bash
npm install ../path/to/arkadia-web-client-extension/plugin-types
```

## Usage

Once installed, you can import types in your TypeScript plugin files:

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "myPlugin";

  // TypeScript now provides full autocomplete and type checking!
  api.triggers.register(
    /pattern/i,
    (line, matches) => {
      // Full IDE support with autocomplete
      const redColor = api.colors.fromHex("#ff0000");
      return line.prefix(">> ", redColor);
    },
    tag
  );

  // Subscribe to events with full type safety
  api.events.on("mapMove", () => {
    console.log("Player moved!");
  });

  return {
    name: "My Plugin",
    version: "1.0.0",
    description: "Plugin with full type safety"
  };
}

export async function destroy(): Promise<void> {
  // Cleanup
}
```

## Available Types

### Core Plugin Types

- `PluginApi` - Main plugin API interface (namespaced)
- `Plugin` - Plugin interface
- `PluginInfo` - Plugin metadata

### API Namespaces

- `TriggersApi` - Trigger management (`api.triggers`)
- `AliasesApi` - Command alias management (`api.aliases`)
- `EventsApi` - Event subscription and emission (`api.events`)
- `MapApi` - Map position access (`api.map`)
- `OutputApi` - Output to game window (`api.output`)
- `ColorsApi` - Color creation helpers (`api.colors`)

### Event System

- `ClientEvents` - **All available events with their payloads**
- Event types include:
  - Game events: `mapMove`, `enterLocation`, `kill`, `enemyKilled`
  - GMCP events: `gmcp`, `gmcp.room.info`, `gmcp.char.vitals`, etc.
  - Timer events: `lampTimer`, `coverTimer`, `combatTimer`, `zaskTimer`
  - System events: `client.connect`, `client.disconnect`, `storage`
  - And 60+ more fully typed events!

### Trigger System

- `Trigger` - Trigger instance
- `TriggerCallback` - Trigger callback function
- `TriggerPattern` - Pattern types for triggers
- `TriggerOptions` - Trigger configuration options
- `isType()` - Helper function for type-based triggers

### Text Formatting

- `AnsiAwareBuffer` - Line buffer with formatting
- `FormatStateSnapshot` - Complete text formatting state
- `FormatColor` - Color union type
- `IndexedColor`, `RgbColor`, `HexColor` - Specific color formats
- `TextRange` - Text range tuple `[start, end]`

### Map System

- `MapPosition` - Map position with room ID and coordinates

## Example with Full Types

```typescript
import type { PluginApi, PluginInfo, TriggerOptions } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "examplePlugin";

  // Define colors with full type safety
  const goldColor = api.colors.fromHex("#ffd700");
  const redColor = api.colors.fromRgb(255, 0, 0);

  // Register trigger with options
  const options: TriggerOptions = {
    caseInsensitive: true,
    stayOpenLines: 5
  };

  const trigger = api.triggers.register(
    /treasure/i,
    (line, matches, type) => {
      // TypeScript knows all available methods on 'line'
      const matchIndex = line.text.indexOf(matches[0]);
      if (matchIndex === -1) return line;

      return line.color([matchIndex, matchIndex + matches[0].length], goldColor);
    },
    tag,
    options
  );

  // Register child trigger
  trigger.registerChild(
    /gold coins/i,
    (line) => {
      api.output.print("Gold coins found!", "system");
      return line.prefix("[GOLD] ", goldColor);
    },
    tag
  );

  // Register alias with type checking
  api.aliases.register(/^\/treasure$/, () => {
    api.output.print("Treasure finder plugin is active!", "system");
    return true; // Stop further processing
  });

  // Subscribe to events with full type safety
  api.events.on("mapMove", () => {
    console.log("Player moved to new location");
  });

  // Subscribe to GMCP events with typed payloads
  api.events.on("gmcp", (data) => {
    console.log("GMCP data:", data.path, data.value);
  });

  // Subscribe to specific GMCP paths
  api.events.on("gmcp.room.info", (roomData) => {
    console.log("Room info updated:", roomData);
  });

  // Subscribe to kill events
  api.events.on("enemyKilled", (data) => {
    if (data.killer === "ME") {
      api.output.print("You killed an enemy!", "system");
    }
  });

  // Get and set map position
  const pos = api.map.getPosition();
  if (pos) {
    console.log(`Current position: ${pos.id} (${pos.x}, ${pos.y}, ${pos.z})`);
  }

  return {
    name: "Example Plugin",
    version: "1.0.0",
    author: "Plugin Developer",
    description: "Example with full TypeScript support and event handling"
  };
}

export async function destroy(): Promise<void> {
  console.log("Plugin destroyed");
}
```

## TypeScript Configuration

Add this to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "types": ["@arkadia/plugin-types"]
  }
}
```

## Building Your Plugin

Use a bundler like esbuild, webpack, or Rollup to compile your TypeScript plugin:

```bash
# Using esbuild
esbuild my-plugin.ts --bundle --format=esm --outfile=my-plugin.js
```

## Benefits of Using Types

1. **IDE Autocomplete** - Get suggestions for all available methods and properties
2. **Type Safety** - Catch errors at compile time instead of runtime
3. **Better Documentation** - Inline documentation appears in your IDE
4. **Refactoring Support** - Safely rename and refactor code
5. **Discoverability** - Explore the API through your IDE

## API Documentation

For complete API documentation, see the inline JSDoc comments in `index.d.ts` or use your IDE's "Go to Definition" feature.

## Examples

See the `examples/` directory in the main repository for working examples:

- `simple-highlighter-plugin.ts` - Basic text highlighting
- `example-plugin.ts` - Intermediate features
- `combat-alert-plugin.ts` - Advanced state management

## License

MIT

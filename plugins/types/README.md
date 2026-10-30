# @arkadia/plugin-types

TypeScript type definitions for developing Arkadia Web Client plugins.

## Installation

The package is published on npm as `@dargoth-client/plugin-types`. Install it under the name the imports use:

```bash
npm i -D @arkadia/plugin-types@npm:@dargoth-client/plugin-types
# or
yarn add -D @arkadia/plugin-types@npm:@dargoth-client/plugin-types
```

There are no versions to track. The npm package is a thin wrapper published once. On every install it downloads this folder's contents (types, `esbuild.cjs`, the `arkadia-plugin` tools and the AI skill) from the deployed client into `node_modules/@arkadia/plugin-types/latest/`, so the types always match what players run. `npx arkadia-plugin types` refreshes them without reinstalling. When the download fails the previous copy stays.

Do not depend on the tarball URL directly (`"@arkadia/plugin-types": "https://…/arkadia-plugin-types.tgz"`): its content changes with every deploy, so the checksum in the lockfile stops matching and installs fail.

To test against a client you build yourself, point the download at your tarball:

```bash
yarn build:types                                   # in this repo
ARKADIA_PLUGIN_TYPES_URL=/path/to/plugin-types/dist/arkadia-plugin-types.tgz npx arkadia-plugin types
```

## Dev tools

`npx arkadia-plugin <command>`, run in the plugin's folder:

| Command | What it does |
|---------|--------------|
| `init` | Creates the missing `plugin.json`, entry file, `tsconfig.json`, `.gitignore` and npm scripts; never overwrites |
| `dev [--port 5177] [--strict-port]` | Rebuilds on change and serves `dist/` on localhost. The client reloads the plugin after every rebuild. A taken port moves to the next free one; `--strict-port` fails instead |
| `build` | Bundles `dist/plugin.js` (entry from `plugin.json`'s `entryPoint`, TSX against the host React) |
| `types` | Downloads the current types and tools |
| `skill` | Copies the AI-assistant guide to `.claude/skills/arkadia-plugin` |

The tools live in `cli/` and ship inside the tarball, so they update with the client; the npm wrapper (`npm/`) only forwards to them.

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

## React Plugins (TSX)

Popups can be React components, but they must use the client's React (`api.ui.react`), not a bundled copy, or hooks fail. The package ships an esbuild plugin that maps `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client` and `@arkadia/ui` to the client at runtime (`arkadia-plugin dev/build` apply it already; extra esbuild options such as `define` or `loader` go in `arkadia-plugin.config.mjs`):

```js
import { build } from 'esbuild';
import { arkadiaHostUi } from '@arkadia/plugin-types/esbuild.cjs';

await build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  outfile: 'dist/plugin.js',
  plugins: [arkadiaHostUi()],
});
```

```tsx
import { useState } from 'react';
import { Button } from '@arkadia/ui';

const Counter = () => {
  const [n, setN] = useState(0);
  return <Button variant="solid" onClick={() => setN(n + 1)}>Klik {n}</Button>;
};
```

For types, add `"@arkadia/plugin-types/ui"` to `compilerOptions.types` and install `@types/react` as a dev dependency.

> **Experimental:** `api.ui.components` / `@arkadia/ui` (Button, HeaderButton, Segmented, Select, Input, Field, Check, MenuButton, Notice) and their props may change between client versions.

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

`npx arkadia-plugin build` (see [Dev tools](#dev-tools)) is enough for most plugins. Any bundler that emits a single ES module works too:

```bash
esbuild my-plugin.ts --bundle --format=esm --outfile=my-plugin.js
```

The full local workflow is described in "Pisanie Pluginu Lokalnie" in `docs/PLUGINS.md`.

## AI Assistants

`skills/arkadia-plugin/SKILL.md` tells a coding assistant how a plugin is built, where the API is documented, how to run it locally and how to debug it. `npx arkadia-plugin skill` copies it to `.claude/skills/arkadia-plugin` for Claude Code. Other tools: point your `AGENTS.md` at `node_modules/@arkadia/plugin-types/latest/skills/arkadia-plugin/SKILL.md`.

## Benefits of Using Types

1. **IDE Autocomplete** - Get suggestions for all available methods and properties
2. **Type Safety** - Catch errors at compile time instead of runtime
3. **Better Documentation** - Inline documentation appears in your IDE
4. **Refactoring Support** - Safely rename and refactor code
5. **Discoverability** - Explore the API through your IDE

## API Documentation

For complete API documentation, see the inline JSDoc comments in `index.d.ts` or use your IDE's "Go to Definition" feature.

## Examples

See the `plugins/examples/` directory in the main repository for working examples:

- `simple-highlighter-plugin.ts` - Basic text highlighting
- `example-plugin.ts` - Intermediate features
- `combat-alert-plugin.ts` - Advanced state management

## License

MIT

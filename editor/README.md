# Arkadia Plugin Editor

A standalone Monaco-based code editor for creating and editing Arkadia plugins with support for both JavaScript and TypeScript.

## Features

- **Monaco Editor**: Full-featured code editor with syntax highlighting, IntelliSense, and auto-completion
- **JavaScript Support**: Write plugins directly in JavaScript
- **TypeScript Support**: Write plugins in TypeScript with automatic compilation to JavaScript using esbuild WASM
- **Separate Storage**: Plugins edited in the editor are stored in a separate IndexedDB database (`ArkadiaPluginEditorDB`)
- **Auto-sync**: Compiled JavaScript is automatically synced to the main plugin storage for loading by the game client
- **Dual-file Storage**: TypeScript source is preserved for editing, while compiled JavaScript is used for execution

## Architecture

### Storage

The editor uses a separate IndexedDB database to avoid conflicts with the main application:

- **Editor Database**: `ArkadiaPluginEditorDB` (stores both source and compiled code)
- **Main Plugin Database**: `ArkadiaPluginsDB` (receives compiled JS for loading)

### File Types

- **JavaScript files**: Stored as-is, both source and compiled are identical
- **TypeScript files**: Source (.ts) is stored for editing, compiled (.js) is generated and synced to main storage

## Usage

### Accessing the Editor

Open `editor/index.html` in your browser (or navigate to `/editor/` in the deployed app).

### Creating a New Plugin

1. Click the **"New"** button
2. Enter a plugin name
3. Select language (JavaScript or TypeScript)
4. Click **"Create"**

The editor will create a plugin with a template structure.

### Editing a Plugin

1. Select a plugin from the dropdown
2. Edit the code in the Monaco editor
3. Click **"Save"** (or press Ctrl+S / Cmd+S)

For TypeScript files, the code will be automatically compiled and synced to the main plugin storage.

### Deleting a Plugin

1. Select the plugin to delete
2. Click the **"Delete"** button
3. Confirm the deletion

This will remove the plugin from both the editor storage and main plugin storage.

### Plugin Template (JavaScript)

```javascript
export async function init(api) {
  return {
    name: "My Plugin",
    version: "1.0.0",
    author: "Your Name",
    description: "Plugin description"
  };
}

export async function destroy() {
  // Cleanup code here
}
```

### Plugin Template (TypeScript)

```typescript
import type { PluginApi } from '@client/PluginApi';
import type { PluginInfo } from '@shared/types/Plugin';

export async function init(api: PluginApi): Promise<PluginInfo> {
  return {
    name: "My Plugin",
    version: "1.0.0",
    author: "Your Name",
    description: "Plugin description"
  };
}

export async function destroy(): Promise<void> {
  // Cleanup code here
}
```

## Keyboard Shortcuts

- **Ctrl+S / Cmd+S**: Save current plugin
- Monaco editor includes standard shortcuts (Ctrl+F for find, etc.)

## Technical Details

### Dependencies

- `monaco-editor`: Code editor
- `esbuild-wasm`: TypeScript to JavaScript compilation

### Build

The editor is built as a separate entry point in Vite:

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    input: {
      client: resolve('index.html'),
      editor: resolve('editor/index.html'),  // Separate bundle
    }
  }
}
```

This ensures Monaco and esbuild are NOT included in the main application bundle.

### Integration with Main App

The editor syncs compiled JavaScript to the main plugin storage using the `pluginStorage` module:

```typescript
import { storePluginScript, updatePluginScript } from '../src/client/utils/pluginStorage'
```

Plugins created/edited in the editor can be loaded by the main application through the Scripts settings panel.

## Development

### Running in Dev Mode

```bash
yarn dev
```

Then navigate to `http://localhost:5173/editor/`

### Building

```bash
yarn build
```

Output will be in `dist/editor/`

## Type Definitions

The file `plugin-api.d.ts` contains TypeScript type definitions for the Arkadia Plugin API. This file is **auto-generated** from the source code to maintain a single source of truth.

### Regenerating Type Definitions

When you update the Plugin API (changes to `src/client/PluginApi.ts`, `src/shared/types/Plugin.ts`, or related files), regenerate the type definitions:

```bash
yarn generate:plugin-types
```

Or directly:

```bash
node scripts/generate-plugin-types.js
```

### Source Files

The type definitions are extracted from:
- `src/client/PluginApi.ts` - Main Plugin API interfaces with JSDoc documentation
- `src/shared/types/Plugin.ts` - Core plugin types (PluginInfo, Plugin, LoadedPlugin)
- `src/client/Triggers.ts` - Trigger-related types
- `src/client/ansi/FormatState.ts` - Format state types for text styling

### Manual Editing

**Do not manually edit `plugin-api.d.ts`** - your changes will be overwritten the next time the file is regenerated. Instead:

1. Update the JSDoc comments in the source files (e.g., `src/client/PluginApi.ts`)
2. Run `yarn generate:plugin-types` to regenerate
3. The updated types will be available in Monaco with full IntelliSense and hover documentation

The type definitions are imported as a raw string using Vite's `?raw` syntax and injected into Monaco's TypeScript environment, providing full autocomplete and hover documentation for plugin developers.

## Future Enhancements

Potential features for future development:

- Import/export plugins as files
- Plugin templates library
- Real-time compilation errors in the editor
- Multi-file plugin support
- Version history / undo tree
- Collaborative editing

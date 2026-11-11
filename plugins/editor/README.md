# Arkadia Plugin Editor

A standalone Monaco-based code editor for creating and editing Arkadia plugins with support for both JavaScript and TypeScript.

## Features

- **Monaco Editor**: Full-featured code editor with syntax highlighting, IntelliSense, and auto-completion
- **JavaScript Support**: Write plugins directly in JavaScript
- **TypeScript Support**: Write plugins in TypeScript with automatic compilation to JavaScript using esbuild WASM
- **Separate Storage**: Plugins edited in the editor are stored in a separate IndexedDB database (`ArkadiaPluginEditorDB`)
- **Auto-sync**: Compiled JavaScript is automatically synced to the main plugin storage for loading by the game client
- **Dual-file Storage**: TypeScript source is preserved for editing, while compiled JavaScript is used for execution
- **Preview tabs**: A single click in the file tree (or a search result, a problem, Ctrl+P, a jump to a definition) opens the file in an italic preview tab that the next one replaces; editing it or double-clicking keeps it open. Can be turned off in the settings
- **Local history and compare**: Every save keeps a version of each file that changed, in this browser's IndexedDB, so it survives reloads. "Compare with Saved" and "File History" (tab menu, file tree menu, editor right-click menu) show a diff against the saved version or an older one; the current side stays editable, and Restore puts an old version back as one edit that Ctrl+Z undoes. The settings set how many versions per file and how many days to keep
- **Tabs and split view**: Files open as tabs; split the editor in two (the button at the end of the tab strip, Ctrl+\\, or "Open to the Side" in the file tree's menu) and drag tabs to reorder them or move them between the two groups. Middle-click closes a tab; right-click has Close Others, Close to the Right and Move. Open tabs are remembered per plugin.
- **Problems panel**: Click the error/warning counts in the status bar (or Ctrl+Shift+M) to list every error and warning in the plugin, grouped by file; click one to jump to it. Errors from bundling on save (a missing import, a syntax error) are listed there too and marked in the file; editing the line clears them
- **Search across files**: Ctrl+Shift+F (or the Search tab above the file tree) searches every file of the plugin, unsaved edits included, with match case, whole word and regular expression options. Replace All changes every match after asking; Ctrl+Z in a file undoes it there
- **Works offline from CDNs**: esbuild's wasm is served with the editor rather than fetched from unpkg

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

Open `plugins/editor/index.html` in your browser (or navigate to `/editor/` in the deployed app).

Opened without a plugin (no `?plugin=<id>` in the URL), the editor shows a
welcome screen with your recent plugins. The open plugin's id is kept in the
URL, so a reload reopens it.

### Creating a New Plugin

1. Click **New plugin** on the welcome screen, or in the plugin switcher
2. Enter a plugin name
3. Pick the language (TypeScript or JavaScript); it is fixed for the plugin,
   and each file's language follows its extension
4. Click **Create plugin**

The editor will create a plugin with a template structure.

### Editing a Plugin

1. Open the plugin switcher (the plugin name at the top left, or **Ctrl+O**),
   type to filter and press Enter
2. Edit the code in the Monaco editor
3. Click **Save** (or press Ctrl+S / Cmd+S)

Saving bundles the plugin and syncs it to the main plugin storage. The header
shows whether there are unsaved changes; the status bar counts errors and
warnings (click it to jump to the first one). Switching plugins with unsaved
changes asks whether to save or discard them.

### Rename, Download, Publish, Delete

These live in the **⋯** menu next to Save. Renaming saves the plugin.
Deleting asks for confirmation and removes the plugin from both the editor
storage and main plugin storage.

### Editing in an IDE: Link to local folder

**⋯ → Link to local folder…** mirrors the open plugin to a folder on disk, so
any IDE can edit it, no IDE plugin needed (Chrome/Edge only: it uses the
File System Access API).

- An empty folder gets the plugin's files. A folder that already has files
  asks which side wins: **Use folder files** replaces the plugin's files,
  **Overwrite folder** writes the plugin and deletes the folder's other
  source files.
- The folder is checked every second (and on returning to the tab). Files
  your IDE saves there are bundled and passed to the game client, as if
  saved in the editor; deleting a file there deletes it from the plugin.
- Saving in the editor writes the plugin back to the folder.
- Only source files are mirrored (`.ts`, `.js`, `.json`, `.md`, `.css`,
  `.html`, …); `node_modules`, `dist`, `build`, `out`, dot-folders and
  `package-lock.json` are ignored.
- The link is remembered per plugin. After a reload the browser may ask for
  access again: click **Reconnect** in the status bar. Opening a linked
  plugin takes in folder files changed since its last save and writes the
  rest from the plugin. Click the folder chip to unlink or change folders;
  unlinking leaves the files on disk.

### Import from GitHub, and pull its changes

**Import from GitHub** (welcome screen, or **GitHub…** in the plugin switcher)
reads a plugin from a public repository and opens it as a new plugin. It takes
`owner/repo`, `owner/repo/folder`, either with `@branch` (or a tag or commit),
or a github.com address such as `https://github.com/owner/repo/tree/main/folder`.
Without a branch it reads the default branch.

- No account or token: private repositories are not supported. GitHub allows
  60 API requests an hour without signing in; an import or a pull uses two
  (file contents come from `raw.githubusercontent.com`, which does not count).
- Only source files are taken, the same ones a linked local folder mirrors;
  at most 300 files of up to 1 MB each.
- **⋯ → Pull from GitHub** (shown only for an imported plugin) takes the
  changes made on GitHub since the last import or pull. The plugin remembers
  that commit and the git blob id of each file in it, so files you changed
  here are kept. A file changed on both sides is the one thing it asks about:
  keep yours, or use GitHub's. Unsaved changes are saved first.
- Pulling only reads. To send changes back, link the plugin to a folder that
  is a clone of the repository (above) and commit there.

### Editor Settings

The gear at the top right holds the editor theme, font size, minimap and the
IDE connection.

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
- **Ctrl+O**: Switch plugin
- **Ctrl+P**: Go to file
- **Ctrl+\\**: Split the editor (open the current file beside it)
- **Ctrl+Shift+M**: Show or hide the Problems panel
- **Ctrl+Shift+F**: Search across files (with text selected, searches for it)
- **Ctrl+Shift+E**: Back to the file tree
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
      editor: resolve('plugins/editor/index.html'),  // Separate bundle
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

The editor uses the same type definitions as the `@arkadia/plugin-types` package:
`plugins/types/index.d.ts`, imported as a raw string with Vite's `?raw` syntax and
injected into Monaco's TypeScript environment for autocomplete and hover documentation.

That file is **generated, not committed** (it is in `.gitignore`). It holds every type
`src/client/PluginApi/index.ts` exports, with everything those types reference, taken
from their source declarations (so the JSDoc in the source is what plugin authors see).
Vite generates it: on every build, when it is missing under `yarn dev` or `yarn test`,
and again under `yarn dev` whenever a file in `src/client/PluginApi/` changes. To
regenerate it by hand (and build the npm tarball):

```bash
yarn build:types
```

## Future Enhancements

Potential features for future development:

- Import/export plugins as files
- Plugin templates library
- Real-time compilation errors in the editor
- Multi-file plugin support
- Version history / undo tree
- Collaborative editing

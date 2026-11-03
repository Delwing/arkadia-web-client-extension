---
name: arkadia-plugin
description: Write, run and debug a plugin for the Arkadia Web Client (the browser client for the Polish MUD Arkadia). Use whenever working in a project that depends on @arkadia/plugin-types, when adding triggers, aliases, popups, footer chips or GMCP handling to such a plugin, when colouring, linking or printing text or tables from one, when a plugin does not load or reacts twice after a reload, or when looking up what the plugin API offers.
---

# Arkadia Web Client plugins

A plugin is one ES module the client loads from a URL. It exports `init(api)`,
which registers everything and returns `PluginInfo`, and optionally `destroy()`
and a `stableId`. The client hands it a `PluginApi`; that object is the plugin's
only door into the client - do not reach for `window` globals.

```ts
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export const stableId = 'moj-plugin'; // optional; keeps storage across URLs

const TAG = 'mojPlugin';
let pluginApi: PluginApi | undefined;

export async function init(api: PluginApi): Promise<PluginInfo> {
  pluginApi = api;
  api.triggers.register(/^Ktos przybywa\.$/, (line) => line, TAG);
  return { name: 'Moj Plugin', version: '1.0.0', description: '...' };
}

export async function destroy(): Promise<void> {
  pluginApi?.triggers.removeByTag(TAG);
}
```

## Where the API is documented

Read before guessing - the API is large and most needs are already covered.

1. **Types**: `node_modules/@arkadia/plugin-types/latest/index.d.ts`. Generated from
   the client's own `PluginApi/` sources, so it is the exact current surface. It is
   big: grep it for the namespace you need (`interface TriggersApi`,
   `interface GmcpApi`, `registerPersistentPopup`, ...) instead of reading it
   whole. `ui.d.ts` next to it types the `@arkadia/ui` React components.
2. **Guide** (Polish, with examples for every `api.*` namespace, UI rules,
   loading, publishing):
   https://raw.githubusercontent.com/Delwing/arkadia-web-client-extension/master/docs/PLUGINS.md
3. **Example plugins**:
   https://github.com/Delwing/arkadia-web-client-extension/tree/master/plugins/examples
   (`gmcp-inspector-plugin.ts` shows live GMCP traffic - useful for finding
   which GMCP path carries the data you want).

## Project setup and dev loop

The package is `@dargoth-client/plugin-types`, installed under the alias the
imports use:

```
npm i -D @arkadia/plugin-types@npm:@dargoth-client/plugin-types typescript
yarn add -D @arkadia/plugin-types@npm:@dargoth-client/plugin-types typescript
```

It has no versions to bump: every install downloads the types (and the
`arkadia-plugin` tools) from the deployed client into `latest/`. An old
`"@arkadia/plugin-types": "https://.../arkadia-plugin-types.tgz"` dependency
breaks installs after each client deploy (lockfile checksum) - replace it with
the alias above. Delete a plugin's own `build.mjs` only if it does nothing
beyond bundle + serve.

```
package.json   scripts: dev / build / typecheck (tsc --noEmit) / types
plugin.json    { name, version, author, description, entryPoint, folders }
plugin.ts      entry (whatever plugin.json's entryPoint names)
tsconfig.json  ES2022, moduleResolution Bundler, jsx react-jsx, strict, noEmit
```

`npx arkadia-plugin <command>`:

- `init` - creates the missing files above and the npm scripts; never overwrites.
- `dev [--port N] [--strict-port]` - rebuilds on change and serves `dist/` on
  `http://localhost:5177/plugin.js`. A taken port moves to the next free one
  (a new address = a separate plugin in the client); `--strict-port` fails
  instead.
- `build` - `dist/plugin.js` (esm, sourcemap, TSX via the host React).
- `types` - refresh types and tools from the deployed client.
- `skill` - copy this guide into `.claude/skills/arkadia-plugin`.

The user adds the dev URL once in the client (Wtyczki -> Dodaj plugin -> Z
adresu URL). After that the client reloads the plugin by itself on every
rebuild and prints "Przeladowano <name>." in the game window. You cannot drive
the client yourself: after a change, tell the user what to look for.

esbuild strips types without checking them. Run the `typecheck` and `build`
scripts yourself before saying a change is done.
- Multi-file plugins import siblings relatively; the bundle is one file. When
  the plugin is published to the catalog the registry compiles the sources from
  `plugin.json`'s `entryPoint` + `folders`, and resolves only relative `.ts`,
  `.js` and `.json` imports - keep runtime dependencies out, or vendor them.

## Rules that bite

- **Clean up in `destroy()`.** On unload/reload the client removes the plugin's
  aliases, popups, menu entries, footer items, map overlays, macros and command
  hooks itself. It does NOT remove triggers, `api.events.on` listeners, timers,
  DOM listeners or anything else you created. Tag every trigger with one tag and
  `removeByTag` it, `api.events.off` every listener (keep the function
  reference), clear every interval. Symptom of a miss: after a reload each
  line fires twice.
- **Game text is ASCII.** Arkadia sends Polish without diacritics
  ("Ktos przybywa", "zolty"), so write trigger patterns in ASCII. UI text you
  show the player (popups, labels, notifications) should use proper Polish
  letters.
- **Trigger callbacks return the line** (possibly changed, see below), or
  `null` to gag it.
- **UI**: build popups with `api.ui` / `registerPersistentPopup` and the
  client's `popup-*` classes and CSS variables (guide section "Wygląd
  Interfejsu (UI)"). No Bootstrap, no hard-coded colours. For React/TSX use the
  host React (and React DOM) - `arkadia-plugin build/dev` do this already; a
  custom build needs the `arkadiaHostUi()` esbuild plugin from
  `@arkadia/plugin-types/esbuild.cjs`. A bundled copy of React breaks hooks.
- **Extra esbuild options** (`define`, `loader`, plugins) go in
  `arkadia-plugin.config.mjs` next to `plugin.json`: a default export of
  options, or `({ command }) => options`. It cannot change the entry or output.
- **Storage** (`api.storage`, window positions) is keyed by `stableId`, or by
  the plugin URL when there is none. Without `stableId` the localhost build and
  the published build see different data.
- **Version** shown to players comes from `PluginInfo.version` returned by
  `init()`; bump it together with `plugin.json` before a release.

## Changing and printing text

A trigger's `line` and anything you print are the same kind of line, with one
API. Prefer selections over positions: write the text, then select a part and
change it.

```ts
// In a trigger: matches -> the matched text (or a capture group, by number or name)
api.triggers.register(/^(\w+) (\w+) flakonik/, (line, m) =>
  line.select(m, 2).fg('gold').link(() => api.command.send('wypij flakonik')).after(' (!)', { fg: 'gray' }).line, TAG);

line.select()                         // whole line
line.select('miecz')                  // first occurrence in the line as it is now
line.selectAll(/(\d+) mithrylow/, 1)  // every occurrence (no g flag needed)

// Printing: api.text, never `new api.AnsiAwareBuffer`
api.output.print(api.text('Uwaga!', { fg: 'tomato', bold: true }));
api.output.print(api.text(`Haslo: ${pw}`).select(pw).fg('gold'));        // write, then colour
api.output.print(api.text('Haslo: ').append(pw, { fg: 'gold' }));         // or colour as you write

// Tables: client frame, fits api.output.width, returns a line you can still colour
const table = api.output.table({ title: 'Zapasy', columns: ['Rzecz', { header: 'Ile', align: 'right' }], rows });
table.selectAll('brak').fg('gray');
api.output.print(table);
```

- **Styles** everywhere take `{ fg, bg, bold, italic, underline, strikethrough,
  link, cssClass }`; colours are `'#rrggbb'`, a Mudlet colour name (`'gold'`) or
  a palette index. `api.colors.fromHex(...)` states work too.
- **Selection methods**: `fg`, `bg`, `style`, `bold`/`italic`/`underline`/
  `strikethrough`, `link`, `restyle`, `replace(text | old => new, style?)`,
  `remove`, `before`, `after`, and `select`/`selectAll` to move to another part
  of the same line. `.line` gives the line back (to return from a trigger);
  `print` accepts a selection as is.
- **Do not** find positions with `line.text.indexOf(matches[0])`: `matches` are
  offsets into the line as the game sent it, and an earlier trigger may have
  changed it; the text may also repeat. `select(matches)` maps them correctly.
- **Colouring keeps what it doesn't set** (links from other triggers,
  backgrounds). `restyle(...)` / `restyle({})` replaces or clears formatting.
- **`append(text)` without a style continues the formatting before it, link
  included.** Pass a style, or `{}` for plain text. `prefix`/`suffix` and a
  selection's `before`/`after` are plain unless given a style.
- **Layout**: `padEnd`/`padStart`/`center` (plain padding), `truncate(n)`,
  `wrap(n, { indent })`, `slice(start, end)`.

## Debugging checklist

- Plugin missing or marked as error in the Wtyczki window: the message there and
  the browser console (F12) show the `init()` exception. Sourcemaps point at the
  `.ts` sources.
- Trigger never fires: test it without waiting for the game with
  `/fake <line>` in the client - it runs the text through all triggers as if it
  came from the server (`/fake --type=room.short <text>` sets the message type).
  Check the pattern against the exact ASCII line, anchors and trailing period.
- Need to see a value in context: `api.output.print(...)` writes into the game
  window; `console.log` goes to F12.
- Reacts twice: see "Clean up in `destroy()`", and check the catalog copy of
  the same plugin is not also enabled.

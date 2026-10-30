# @dargoth-client/plugin-types

Types and dev tools for [Arkadia Web Client](https://delwing.github.io/arkadia-web-client-extension/) plugins.

```bash
npm i -D @arkadia/plugin-types@npm:@dargoth-client/plugin-types typescript
# or
yarn add -D @arkadia/plugin-types@npm:@dargoth-client/plugin-types typescript
```

Install it under the alias `@arkadia/plugin-types` - that is the name plugins import:

```ts
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';
```

## Always current, no versions

This package is a thin wrapper. On every install it downloads the types and tools from the deployed client, so they always match what players run. Refresh them without reinstalling:

```bash
npx arkadia-plugin types
```

If the download fails, the previous copy stays (the package ships one from the day it was published). Installs that skip scripts (`--ignore-scripts`, pnpm, Bun) keep that older copy until you run the command above. Yarn Plug'n'Play needs `nodeLinker: node-modules`.

## Dev tools

```bash
npx arkadia-plugin init                  # plugin.json, plugin.ts, tsconfig.json, npm scripts
npx arkadia-plugin dev                   # rebuild + serve on http://localhost:5177/plugin.js
npx arkadia-plugin dev --strict-port     # fail instead of moving to the next free port
npx arkadia-plugin build                 # dist/plugin.js
npx arkadia-plugin skill                 # AI-assistant guide -> .claude/skills/arkadia-plugin
```

Add the `dev` URL once in the client (Wtyczki -> Dodaj plugin -> Z adresu URL). From then on the client reloads the plugin by itself after every rebuild.

Full guide (Polish): https://github.com/Delwing/arkadia-web-client-extension/blob/master/docs/PLUGINS.md

## Maintainers

The source is `plugins/types/npm/` in the client repository. Publish only when the wrapper itself changes (`bin/`, the forwarding files); the types and tools reach users through the client deploy. `npm publish` packs a fresh snapshot of the deployed tarball into `latest/` first (`prepack`); set `ARKADIA_PLUGIN_TYPES_URL` to a local `.tgz` to pack another one.

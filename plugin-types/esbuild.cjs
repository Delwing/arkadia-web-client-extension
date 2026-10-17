/**
 * esbuild plugin for Arkadia Web Client plugins that use React.
 *
 * Resolves `react`, `react/jsx-runtime` and `@arkadia/ui` to the client's own
 * copies at runtime instead of bundling them. A plugin that bundles its own
 * React gets a second copy, and its hooks then fail inside client popups.
 *
 * @example
 * // build.mjs
 * import { build } from 'esbuild';
 * import { arkadiaHostUi } from '@arkadia/plugin-types/esbuild.cjs';
 * await build({
 *   entryPoints: ['src/index.tsx'],
 *   bundle: true,
 *   format: 'esm',
 *   jsx: 'automatic',
 *   outfile: 'dist/plugin.js',
 *   plugins: [arkadiaHostUi()],
 * });
 */
const { PLUGIN_UI_MODULE_FILTER, buildPluginUiShim } = require('./pluginUiShim.cjs');

function arkadiaHostUi() {
  return {
    name: 'arkadia-host-ui',
    setup(build) {
      build.onResolve({ filter: PLUGIN_UI_MODULE_FILTER }, args => ({ path: args.path, namespace: 'arkadia-host-ui' }));
      build.onLoad({ filter: /.*/, namespace: 'arkadia-host-ui' }, args => ({
        contents: buildPluginUiShim(args.path),
        loader: 'js',
      }));
    },
  };
}

module.exports = { arkadiaHostUi };

import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import {
    PLUGIN_UI_GLOBAL,
    PLUGIN_UI_MODULES,
    PLUGIN_UI_MODULE_FILTER,
    PLUGIN_UI_COMPONENT_NAMES,
    buildPluginUiShim,
} from '@shared/pluginUiGlobal.ts';

const require = createRequire(import.meta.url);

// A plugin source that uses everything the shim provides.
const PLUGIN_SOURCE = `
import { useState } from 'react';
import { Button } from '@arkadia/ui';
export function Counter() {
  const [n] = useState(3);
  return <><Button variant="solid" key="b">{n}</Button><span>x</span></>;
}
`;

async function bundle(plugin: esbuild.Plugin): Promise<Record<string, unknown>> {
    const result = await esbuild.build({
        stdin: { contents: PLUGIN_SOURCE, loader: 'tsx', resolveDir: '/' },
        bundle: true,
        format: 'cjs',
        jsx: 'automatic',
        write: false,
        plugins: [plugin],
    });
    const module = { exports: {} as Record<string, unknown> };
    new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
    return module.exports;
}

// Records createElement calls instead of rendering.
function fakeHost() {
    const calls: unknown[][] = [];
    const React = {
        Fragment: Symbol('Fragment'),
        useState: (v: unknown) => [v, () => {}],
        createElement: (...args: unknown[]) => { calls.push(args); return { args }; },
    };
    const components = Object.fromEntries(PLUGIN_UI_COMPONENT_NAMES.map(n => [n, `host:${n}`]));
    (globalThis as Record<string, unknown>)[PLUGIN_UI_GLOBAL] = { React, components };
    return { React, calls };
}

describe('plugin UI shim', () => {
    afterEach(() => { delete (globalThis as Record<string, unknown>)[PLUGIN_UI_GLOBAL]; });

    test('the resolve filter matches exactly the mapped modules', () => {
        for (const m of PLUGIN_UI_MODULES) expect(PLUGIN_UI_MODULE_FILTER.test(m)).toBe(true);
        for (const m of ['react-dom/server', 'reactx', '@arkadia/ui/x', 'preact']) expect(PLUGIN_UI_MODULE_FILTER.test(m)).toBe(false);
    });

    test('react-dom and react-dom/client come from the host', async () => {
        const { arkadiaHostUi } = require('../../plugins/types/esbuild.cjs');
        const ReactDOM = { createPortal: () => 'host:portal', flushSync: () => {}, unstable_batchedUpdates: (fn: () => string) => fn() };
        const ReactDOMClient = { createRoot: () => 'host:root', hydrateRoot: () => {} };
        (globalThis as Record<string, unknown>)[PLUGIN_UI_GLOBAL] = { React: {}, ReactDOM, ReactDOMClient, components: {} };
        const result = await esbuild.build({
            stdin: {
                // unstable_batchedUpdates as @dnd-kit imports it
                contents: `import { createRoot } from 'react-dom/client';
                           import ReactDOMDefault, { createPortal, unstable_batchedUpdates } from 'react-dom';
                           export const root = createRoot(null);
                           export const portal = createPortal(null, null);
                           export const same = ReactDOMDefault.createPortal === createPortal;
                           export const batched = unstable_batchedUpdates(() => 'host:batched');`,
                loader: 'ts',
                resolveDir: '/',
            },
            bundle: true,
            format: 'cjs',
            write: false,
            plugins: [arkadiaHostUi()],
        });
        const module = { exports: {} as Record<string, unknown> };
        new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
        expect(module.exports).toEqual({ root: 'host:root', portal: 'host:portal', same: true, batched: 'host:batched' });
    });

    test('react-dom fails with a clear error on a client that does not publish it', async () => {
        (globalThis as Record<string, unknown>)[PLUGIN_UI_GLOBAL] = { React: {}, components: {} };
        const code = buildPluginUiShim('react-dom/client');
        await expect(import(`data:text/javascript,${encodeURIComponent(code)}`)).rejects.toThrow('older than this plugin');
    });

    test('the published @arkadia/plugin-types esbuild plugin bundles a TSX plugin against the host React', async () => {
        const { arkadiaHostUi } = require('../../plugins/types/esbuild.cjs');
        const { React, calls } = fakeHost();
        const exports = await bundle(arkadiaHostUi());
        (exports.Counter as () => unknown)();

        const [fragment, button, span] = [calls[2], calls[0], calls[1]];
        expect(button).toEqual(['host:Button', { variant: 'solid', children: 3, key: 'b' }]);
        expect(span).toEqual(['span', { children: 'x' }]);
        // Children written out in the source come as separate arguments, so
        // development React does not take them for a list without keys
        expect(fragment).toEqual([React.Fragment, {}, { args: button }, { args: span }]);
    });

    test('the generated shim copy matches the source', () => {
        const generated = require('../../plugins/types/pluginUiShim.cjs');
        for (const m of PLUGIN_UI_MODULES) expect(generated.buildPluginUiShim(m)).toBe(buildPluginUiShim(m));
    });

    test('a bundled plugin fails with a clear error when no UI host has published', async () => {
        const plugin: esbuild.Plugin = {
            name: 'host',
            setup(build) {
                build.onResolve({ filter: PLUGIN_UI_MODULE_FILTER }, a => ({ path: a.path, namespace: 'h' }));
                build.onLoad({ filter: /.*/, namespace: 'h' }, a => ({ contents: buildPluginUiShim(a.path as never), loader: 'js' }));
            },
        };
        await expect(bundle(plugin)).rejects.toThrow('no UI host');
    });
});

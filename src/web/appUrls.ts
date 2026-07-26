/**
 * URLs of the app's sibling entry points (see `rollupOptions.input` in
 * vite.config.ts): the client itself lives at `<root>/index.html`, every other
 * entry at `<root>/<sub-app>/index.html`.
 *
 * Vite builds with `base: "./"`, so there is no absolute base path to hang these
 * off — a link must be resolved relative to the page doing the linking. That is
 * fine for the stock client (served from the root, so `editor/index.html` just
 * works) and wrong for every other entry: from `<root>/forge-ui/index.html` the
 * same relative link resolves to `<root>/forge-ui/editor/index.html`, which does
 * not exist — the sub-apps have no nested copies of each other. Components shared
 * between the UIs (e.g. options/Scripts.tsx, hosted by both the stock settings
 * and the forge menu) therefore have to resolve the root explicitly.
 */

/** Entry directories that sit one level below the client root. */
const SUB_APPS = ['editor', 'viewer', 'log-viewer', 'forge-ui', 'popup'];

/** The client root, derived from the page currently running. */
function appRootUrl(): URL {
    // Directory of the current document — `.../` for both `/foo/` and `/foo/index.html`.
    const dir = new URL('.', window.location.href);
    const segment = dir.pathname.replace(/\/$/, '').split('/').pop() ?? '';
    return SUB_APPS.includes(segment) ? new URL('..', dir) : dir;
}

/** Absolute URL for a path relative to the client root. */
export function appUrl(path: string): string {
    return new URL(path, appRootUrl()).href;
}

/** The plugin editor entry, optionally opened on a specific stored plugin. */
export function editorUrl(pluginId?: string): string {
    const url = appUrl('editor/index.html');
    return pluginId ? `${url}?plugin=${encodeURIComponent(pluginId)}` : url;
}

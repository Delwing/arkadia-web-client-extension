/**
 * Where the UI host publishes its React and plugin UI components for bundled
 * plugins (`globalThis.__arkadiaPluginUi`).
 *
 * Plugins load from blob or remote URLs, so a bare `import "react"` can't
 * resolve, and bundling a second React breaks hooks. Plugin builds instead map
 * `react`, `react/jsx-runtime` and `@arkadia/ui` to small modules that read
 * this global (see `buildPluginUiShim`). The same objects are also on
 * `api.ui.react` and `api.ui.components` for plugins built without a bundler.
 */
export const PLUGIN_UI_GLOBAL = '__arkadiaPluginUi';

/** Modules a plugin build redirects to the host instead of bundling. */
export const PLUGIN_UI_MODULES = ['react', 'react/jsx-runtime', '@arkadia/ui'] as const;

export type PluginUiModule = typeof PLUGIN_UI_MODULES[number];

/** Matches exactly the import paths in PLUGIN_UI_MODULES (an esbuild onResolve filter). */
export const PLUGIN_UI_MODULE_FILTER = /^(react|react\/jsx-runtime|@arkadia\/ui)$/;

// Named React exports a component file typically imports; anything else is on
// the default export.
const REACT_NAMED_EXPORTS = [
    'Children', 'Component', 'Fragment', 'PureComponent', 'StrictMode', 'Suspense',
    'cloneElement', 'createContext', 'createElement', 'createRef', 'forwardRef',
    'isValidElement', 'lazy', 'memo', 'startTransition',
    'useCallback', 'useContext', 'useDebugValue', 'useDeferredValue', 'useEffect',
    'useId', 'useImperativeHandle', 'useInsertionEffect', 'useLayoutEffect', 'useMemo',
    'useReducer', 'useRef', 'useState', 'useSyncExternalStore', 'useTransition',
];

/** The components on `api.ui.components` (experimental). */
export const PLUGIN_UI_COMPONENT_NAMES = [
    'Button', 'Check', 'Field', 'HeaderButton', 'Input', 'MenuButton', 'Notice', 'Segmented', 'Select',
] as const;

/**
 * Source of the ES module that stands in for `module` in a plugin bundle.
 * The UI host publishes the global before any plugin is loaded.
 */
export function buildPluginUiShim(module: PluginUiModule): string {
    const head = `const UI = globalThis[${JSON.stringify(PLUGIN_UI_GLOBAL)}];\n`
        + `if (!UI) throw new Error("Arkadia plugin UI is not available: no UI host is running.");\n`;
    if (module === 'react') {
        return head
            + 'const React = UI.React;\nexport default React;\n'
            + `export const { ${REACT_NAMED_EXPORTS.join(', ')} } = React;\n`;
    }
    if (module === 'react/jsx-runtime') {
        // The automatic JSX runtime passes children inside props, which
        // createElement accepts as-is.
        return head
            + 'const React = UI.React;\n'
            + 'export const Fragment = React.Fragment;\n'
            + 'export function jsx(type, props, key) { return React.createElement(type, key === undefined ? props : { ...props, key }); }\n'
            + 'export const jsxs = jsx;\n';
    }
    return head + `export const { ${PLUGIN_UI_COMPONENT_NAMES.join(', ')} } = UI.components;\n`;
}

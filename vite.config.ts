/// <reference types="vitest/config" />
import {defineConfig, type Plugin} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from "path";
import {execFileSync, execSync} from 'child_process';
import {existsSync} from 'fs';
import {fileURLToPath} from 'url';

const resolveGitInfo = (command: string, fallback: string) => {
    try {
        return execSync(command).toString().trim();
    } catch {
        return fallback;
    }
};

/**
 * The pages other than the client, by the URL they are served at and the folder
 * their source lives in. The URLs predate the folders (links, bookmarks and the
 * client itself point at them), so the build and the dev server keep them.
 */
const PAGES: Record<string, string> = {
    'editor/': 'plugins/editor/',
    'viewer/': 'views/viewer/',
    'log-viewer/': 'views/log-viewer/',
    'popup/': 'views/popup/',
};

const depth = (fileName: string) => fileName.split('/').length - 1;

/** Serves and emits each page in {@link PAGES} at its URL, not its source path. */
function pageUrls(): Plugin {
    return {
        name: 'page-urls',
        enforce: 'post',
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                const url = req.url ?? '';
                for (const [served, source] of Object.entries(PAGES)) {
                    if (url.startsWith('/' + served)) {
                        req.url = '/' + source + url.slice(served.length + 1);
                        break;
                    }
                }
                next();
            });
        },
        generateBundle(_options, bundle) {
            for (const [served, source] of Object.entries(PAGES)) {
                for (const fileName of Object.keys(bundle)) {
                    const file = bundle[fileName];
                    if (!fileName.startsWith(source) || file.type !== 'asset') continue;
                    const target = served + fileName.slice(source.length);
                    // One folder shallower: its relative links to the shared
                    // assets and public files lose a `../`.
                    const html = typeof file.source === 'string'
                        ? file.source.split('../'.repeat(depth(fileName))).join('../'.repeat(depth(target)))
                        : file.source;
                    delete bundle[fileName];
                    this.emitFile({type: 'asset', fileName: target, source: html});
                }
            }
        },
    };
}

/**
 * plugins/types/index.d.ts (and pluginUiShim.cjs) are generated from the source
 * and not committed, while the editors import them (`?raw`). A build always
 * regenerates them; dev and vitest generate them when missing, and the dev
 * server again whenever the plugin API source changes.
 */
function pluginTypes(): Plugin {
    const root = fileURLToPath(new URL('.', import.meta.url));
    const generator = resolve(root, 'plugins/types/generate-types.cjs');
    const output = resolve(root, 'plugins/types/index.d.ts');
    const generate = () => execFileSync(process.execPath, [generator], {stdio: 'inherit'});
    return {
        name: 'plugin-types',
        configResolved(config) {
            if (config.command === 'build' || !existsSync(output)) generate();
        },
        configureServer(server) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const source = resolve(root, 'src/client/PluginApi');
            server.watcher.on('change', (file) => {
                if (!resolve(file).startsWith(source)) return;
                clearTimeout(timer);
                timer = setTimeout(() => {
                    try {
                        generate();
                    } catch {
                        // The generator has said what is wrong; keep serving the last good types
                    }
                }, 500);
            });
        },
    };
}

const commitSha = resolveGitInfo('git rev-parse --short HEAD', 'unknown');
const commitDate = resolveGitInfo('git log -1 --format=%cI', 'unknown');

export default defineConfig({
    plugins: [
        react(),
        pageUrls(),
        pluginTypes(),
        {
            // What is live, for src/web/versionCheck.ts: an open page compares it
            // with the build it was loaded from.
            name: 'version-json',
            apply: 'build',
            generateBundle() {
                this.emitFile({
                    type: 'asset',
                    fileName: 'version.json',
                    source: JSON.stringify({sha: commitSha, date: commitDate}),
                });
            },
        },
    ],
    resolve: {
        tsconfigPaths: true,
        alias: {
            "@client": resolve("./src/client"),
            "@web": resolve("./src/web"),
            "@shared": resolve("./src/shared"),
            "@web-ui": resolve("./src/ui/web"),
            "@modules": resolve("./src/modules"),
            "@ui": resolve("./src/ui"),
        },
    },
    base: "./",
    optimizeDeps: {
        include: ['sql.js/dist/sql-wasm.js'],
    },
    define: {
        __COMMIT_SHA__: JSON.stringify(commitSha),
        __COMMIT_DATE__: JSON.stringify(commitDate),
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./test/vitest.setup.ts'],
        include: ['test/**/*.test.{ts,tsx}'],
        // `vmThreads` isolates each test file in a fresh `vm.createContext()`
        // within a pooled worker thread, instead of spinning up a new
        // `worker_threads.Worker` per file the way `threads`/`forks` do when
        // `isolate: true`. The Worker-per-file model was the Jest→Vitest CI
        // regression: spawning a Worker forces a fresh `import('jsdom')`
        // (~3.5s cold load) on every one of the ~140 test files, which on a
        // 4-core CI runner serialised into ~170s of pure environment startup.
        // `vmThreads` re-uses the jsdom module load across files in the same
        // thread, bringing CI runtime back in line with the old Jest setup
        // without dropping per-file isolation.
        pool: 'vmThreads',
        // Suppress console output from tests that pass (source scripts under
        // test occasionally log). Logs from failing tests still surface so
        // debugging isn't hindered.
        silent: 'passed-only',
    },
    build: {
        minify: true,
        sourcemap: true,
        chunkSizeWarningLimit: 5000,
        rollupOptions: {
            input: {
                client: resolve('index.html'),
                editor: resolve('plugins/editor/index.html'),
                viewer: resolve('views/viewer/index.html'),
                'log-viewer': resolve('views/log-viewer/index.html'),
                popup: resolve('views/popup/index.html'),
            },
            output: {
                manualChunks: (id) => {
                    if (id.includes('node_modules')) {
                        // Firebase SDK
                        if (id.includes('firebase') || id.includes('@firebase')) {
                            return 'vendor-firebase';
                        }
                        // Map renderer (includes konva)
                        if (id.includes('mudlet-map') || id.includes('konva')) {
                            return 'vendor-map';
                        }
                        // esbuild WASM
                        if (id.includes('esbuild')) {
                            return 'vendor-esbuild';
                        }
                        // JSZip
                        if (id.includes('jszip')) {
                            return 'vendor-jszip';
                        }
                        // SQL.js (WebAssembly SQLite)
                        if (id.includes('sql.js')) {
                            return 'vendor-sql';
                        }
                        // Lua interpreter
                        if (id.includes('lua-in-js')) {
                            return 'vendor-lua';
                        }
                    }
                }
            }
        }
    }
})

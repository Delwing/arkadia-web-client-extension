/// <reference types="vitest" />
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from "path";
import {execSync} from 'child_process';

const resolveGitInfo = (command: string, fallback: string) => {
    try {
        return execSync(command).toString().trim();
    } catch {
        return fallback;
    }
};

const commitSha = resolveGitInfo('git rev-parse --short HEAD', 'unknown');
const commitDate = resolveGitInfo('git log -1 --format=%cd --date=short', 'unknown');

export default defineConfig({
    plugins: [
        react(),
    ],
    resolve: {
        tsconfigPaths: true,
        alias: {
            "@client": resolve("./src/client"),
            "@web": resolve("./src/web"),
            "@shared": resolve("./src/shared"),
            "@web-ui": resolve("./src/ui/web"),
            "@modules": resolve("./src/modules"),
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
        // Worker threads share V8 state between files, so jsdom + transform
        // startup amortizes across the ~140 test files instead of being paid
        // per-file like the default `forks` pool. Combined with `isolate: false`
        // (which keeps a single jsdom per worker instead of recreating it for
        // every file), this brings CI runtime back in line with the old Jest
        // setup. Tests in this repo already clean up shared state in
        // `beforeEach`, so dropping isolation is safe.
        pool: 'threads',
        isolate: false,
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
                editor: resolve('editor/index.html'),
                viewer: resolve('viewer/index.html'),
                'log-viewer': resolve('log-viewer/index.html'),
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

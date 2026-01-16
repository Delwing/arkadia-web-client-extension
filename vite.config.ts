import {defineConfig, type PluginOption} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from "path";
import tsconfigPaths from "vite-tsconfig-paths";
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
        tsconfigPaths()
    ] as unknown as PluginOption[],
    resolve: {
        alias: {
            "@client": resolve("./src/client"),
            "@web": resolve("./src/web"),
            "@shared": resolve("./src/shared"),
            "@web-ui": resolve("./src/ui/web"),
            "@modules": resolve("./src/modules"),
        },
    },
    base: "./",
    define: {
        __COMMIT_SHA__: JSON.stringify(commitSha),
        __COMMIT_DATE__: JSON.stringify(commitDate),
    },
    build: {
        minify: true,
        sourcemap: true,
        rollupOptions: {
            input: {
                client: resolve('index.html'),
                editor: resolve('editor/index.html'),
            },
            output: {
                manualChunks: (id) => {
                    if (id.includes('node_modules')) {
                        // Monaco Editor (very large)
                        if (id.includes('monaco-editor')) {
                            return 'vendor-monaco';
                        }
                        // Shiki syntax highlighter
                        if (id.includes('shiki') || id.includes('@shikijs')) {
                            return 'vendor-shiki';
                        }
                        // Firebase SDK
                        if (id.includes('firebase') || id.includes('@firebase')) {
                            return 'vendor-firebase';
                        }
                        // React ecosystem
                        if (id.includes('react') || id.includes('scheduler')) {
                            return 'vendor-react';
                        }
                        // Bootstrap
                        if (id.includes('bootstrap') || id.includes('bootswatch')) {
                            return 'vendor-bootstrap';
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

import {defineConfig, type PluginOption} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import {execSync} from 'child_process';

function safeExec(command: string, fallback: string): string {
    try {
        return execSync(command).toString().trim();
    } catch {
        return fallback;
    }
}
const commitSha = safeExec('git rev-parse --short HEAD', 'dev');
const commitDate = safeExec('git log -1 --format=%cd --date=short', new Date().toISOString().slice(0, 10));

export default defineConfig({
    plugins: [
        react(),
        tsconfigPaths()
    ] as PluginOption[],
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
                plugin: resolve('src/plugin.ts'),
                client: resolve('index.html'),
            }
        }
    }
})

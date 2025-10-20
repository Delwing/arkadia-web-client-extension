import {defineConfig, type PluginOption} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import {execSync} from 'child_process';

const commitSha = execSync('git rev-parse --short HEAD').toString().trim();
const commitDate = execSync('git log -1 --format=%cd --date=short').toString().trim();

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
        target: 'esnext',
        rollupOptions: {
            input: {
                plugin: resolve('src/plugin.ts'),
                client: resolve('index.html'),
                sandbox: resolve('sandbox.html'),
            }
        }
    }
})

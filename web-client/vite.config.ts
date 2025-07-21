import {defineConfig, type PluginOption} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from "path";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [
        react(),
        tsconfigPaths()
    ] as PluginOption[],
    base: "./",
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

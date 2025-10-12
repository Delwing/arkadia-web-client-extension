import { defineConfig, type AliasOptions, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

const commitSha = execSync("git rev-parse --short HEAD").toString().trim();
const commitDate = execSync("git log -1 --format=%cd --date=short").toString().trim();

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const candidateZustandPackages = [
    resolve(projectRoot, "node_modules/zustand/package.json"),
    resolve(projectRoot, "../node_modules/zustand/package.json"),
];

const hasLocalZustand = candidateZustandPackages.some((candidate) => existsSync(candidate));

const alias: AliasOptions = hasLocalZustand
    ? []
    : [
          { find: "zustand/shallow", replacement: resolve(projectRoot, "test/__mocks__/zustand/shallow.ts") },
          { find: "zustand/vanilla", replacement: resolve(projectRoot, "test/__mocks__/zustand/vanilla.ts") },
          { find: "zustand/middleware", replacement: resolve(projectRoot, "test/__mocks__/zustand/middleware.ts") },
          { find: "zustand", replacement: resolve(projectRoot, "test/__mocks__/zustand/index.ts") },
      ];

export default defineConfig({
    plugins: [react(), tsconfigPaths()] as PluginOption[],
    base: "./",
    define: {
        __COMMIT_SHA__: JSON.stringify(commitSha),
        __COMMIT_DATE__: JSON.stringify(commitDate),
    },
    resolve: {
        alias,
    },
    build: {
        minify: true,
        sourcemap: true,
        rollupOptions: {
            input: {
                plugin: resolve("src/plugin.ts"),
                client: resolve("index.html"),
                sandbox: resolve("sandbox.html"),
            },
        },
    },
});

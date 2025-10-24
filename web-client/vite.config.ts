import {defineConfig, type PluginOption} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve, join} from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import {execFileSync, execSync} from 'child_process';
import {fileURLToPath} from "url";
import {createRequire} from "module";
import {existsSync, mkdirSync, rmSync, writeFileSync, renameSync} from "fs";

const commitSha = execSync('git rev-parse --short HEAD').toString().trim();
const commitDate = execSync('git log -1 --format=%cd --date=short').toString().trim();
const configDir = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);

function buildPluginApiPackage(): PluginOption {
    return {
        name: "arkadia-build-plugin-api-package",
        apply: "build",
        async closeBundle() {
            const distDir = join(configDir, "dist");
            const pluginsDir = join(distDir, "plugins");
            mkdirSync(distDir, {recursive: true});
            rmSync(pluginsDir, {recursive: true, force: true});

            const tscBin = require.resolve("typescript/bin/tsc");
            execFileSync("node", [tscBin, "--project", "tsconfig.plugins.json"], {
                cwd: configDir,
                stdio: "inherit",
            });

            const packageDir = join(pluginsDir, "package");
            mkdirSync(packageDir, {recursive: true});

            const declarationPath = join(packageDir, "index.d.ts");
            if (!existsSync(declarationPath)) {
                throw new Error("Plugin API declaration file was not generated");
            }

            const packageJson = {
                name: "arkadia-web-client-plugin-api",
                version: `0.0.0-${commitSha}`,
                description: "Type definitions for Arkadia web client plugins.",
                type: "module",
                types: "./index.d.ts",
                files: [
                    "index.d.ts"
                ],
                sideEffects: false,
                license: "MIT"
            };

            writeFileSync(join(packageDir, "package.json"), JSON.stringify(packageJson, null, 2));

            const packOutput = execFileSync("npm", [
                "pack",
                "--pack-destination",
                pluginsDir,
            ], {
                cwd: packageDir,
                stdio: "pipe",
            }).toString().trim().split(/\r?\n/).at(-1);

            if (!packOutput) {
                throw new Error("Failed to create plugin API tarball");
            }

            const tarballPath = join(pluginsDir, packOutput);
            const finalTarball = join(distDir, "arkadia-web-client-plugin-api.tgz");
            renameSync(tarballPath, finalTarball);
        }
    };
}

export default defineConfig({
    plugins: [
        react(),
        tsconfigPaths(),
        buildPluginApiPackage()
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
                client: resolve('index.html'),
                sandbox: resolve('sandbox.html'),
            }
        }
    }
})

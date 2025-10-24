const fs = require('fs/promises');
const path = require('path');

const srcDir = path.resolve(__dirname, '../src');
const preservedDeclarations = new Set([
    path.normalize('types/MapData.d.ts'),
    path.normalize('types/global.d.ts'),
    path.normalize('types/wasm.d.ts'),
]);
const pluginTypesDir = path.resolve(__dirname, '../../web-client/src/plugins/types/generated');

async function cleanDirectory(dir) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return;
        }
        throw error;
    }

    await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await cleanDirectory(fullPath);
            return;
        }

        if (!entry.isFile() || !entry.name.endsWith('.d.ts')) {
            return;
        }

        const relativePath = path.relative(srcDir, fullPath);
        if (preservedDeclarations.has(path.normalize(relativePath))) {
            return;
        }

        await fs.unlink(fullPath);
    }));
}

async function cleanGeneratedTypes() {
    await cleanDirectory(srcDir);
    await fs.rm(pluginTypesDir, {recursive: true, force: true});
}

module.exports = cleanGeneratedTypes;

if (require.main === module) {
    cleanGeneratedTypes().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

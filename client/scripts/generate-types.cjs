const {execFile} = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const cleanGeneratedTypes = require('./clean-generated-types.cjs');

const projectDir = path.resolve(__dirname, '..');
const distTypesDir = path.join(projectDir, 'dist', 'types');
const srcDir = path.join(projectDir, 'src');
const pluginTypesDir = path.resolve(projectDir, '..', 'web-client', 'src', 'plugins', 'types', 'generated');

function execFileAsync(file, args, options) {
    return new Promise((resolve, reject) => {
        execFile(file, args, options, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve({stdout, stderr});
        });
    });
}

async function copyDeclarations(sourceDir, targetDir) {
    let entries;
    try {
        entries = await fs.readdir(sourceDir, {withFileTypes: true});
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return;
        }
        throw error;
    }

    await Promise.all(entries.map(async (entry) => {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            await copyDeclarations(sourcePath, targetPath);
            return;
        }

        if (!entry.isFile() || !entry.name.endsWith('.d.ts')) {
            return;
        }

        await fs.mkdir(path.dirname(targetPath), {recursive: true});
        await fs.copyFile(sourcePath, targetPath);
    }));
}

async function generateTypes() {
    await cleanGeneratedTypes();

    const tscBin = require.resolve('typescript/bin/tsc', {paths: [projectDir]});
    await execFileAsync(process.execPath, [tscBin, '--project', 'tsconfig.types.json'], {
        cwd: projectDir,
        stdio: 'inherit'
    });

    await copyDeclarations(distTypesDir, srcDir);
    await copyDeclarations(distTypesDir, pluginTypesDir);
    await fs.rm(distTypesDir, {recursive: true, force: true});
}

generateTypes().catch((error) => {
    if (error.stdout) {
        process.stdout.write(error.stdout);
    }
    if (error.stderr) {
        process.stderr.write(error.stderr);
    }
    console.error(error);
    process.exitCode = 1;
});

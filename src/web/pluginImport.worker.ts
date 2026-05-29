import JSZip from 'jszip';
import * as esbuild from 'esbuild-wasm';
import type {
    PluginFile,
    PluginMetadata,
    PluginImportWorkerRequest,
    PluginImportWorkerResponse,
    PluginImportResult,
} from './pluginImport.shared';

let esbuildInitialized = false;

async function initEsbuild(): Promise<void> {
    if (esbuildInitialized) return;
    await esbuild.initialize({
        wasmURL: `https://unpkg.com/esbuild-wasm@${esbuild.version}/esbuild.wasm`,
    });
    esbuildInitialized = true;
}

function getLanguageFromPath(path: string): PluginFile['language'] {
    const extension = path.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'ts':
        case 'tsx':
            return 'typescript';
        case 'js':
        case 'jsx':
        case 'mjs':
        case 'cjs':
            return 'javascript';
        case 'json':
            return 'json';
        default:
            return 'plaintext';
    }
}

function generatePluginId(name: string): string {
    const timestamp = Date.now();
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        const char = name.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return `editor_${Math.abs(hash).toString(36)}_${timestamp}`;
}

async function bundlePlugin(files: Record<string, PluginFile>, entryPoint: string): Promise<string> {
    const virtualFsPlugin: esbuild.Plugin = {
        name: 'virtual-fs',
        setup(build) {
            // Intercept imports starting with ./ or ../
            build.onResolve({ filter: /^\./ }, args => {
                const dir = args.importer ? args.importer.substring(0, args.importer.lastIndexOf('/')) : '';
                let resolved = args.path;

                if (resolved.startsWith('./')) {
                    resolved = dir ? `${dir}/${resolved.substring(2)}` : resolved.substring(2);
                } else if (resolved.startsWith('../')) {
                    const parts = dir.split('/').filter(p => p);
                    const upCount = (resolved.match(/\.\.\//g) || []).length;
                    const remainingPath = resolved.replace(/\.\.\//g, '');
                    const newParts = parts.slice(0, parts.length - upCount);
                    resolved = newParts.length ? `${newParts.join('/')}/${remainingPath}` : remainingPath;
                }

                // Add extension if missing
                if (!resolved.endsWith('.ts') && !resolved.endsWith('.js') && !resolved.endsWith('.json')) {
                    if (files[`${resolved}.ts`]) {
                        resolved = `${resolved}.ts`;
                    } else if (files[`${resolved}.js`]) {
                        resolved = `${resolved}.js`;
                    } else if (files[`${resolved}.json`]) {
                        resolved = `${resolved}.json`;
                    }
                }

                return {
                    path: resolved,
                    namespace: 'plugin-vfs'
                };
            });

            // Load files from virtual file system
            build.onLoad({ filter: /.*/, namespace: 'plugin-vfs' }, args => {
                const file = files[args.path];

                if (!file) {
                    return {
                        errors: [{
                            text: `File not found: ${args.path}`,
                            location: null
                        }]
                    };
                }

                let loader: esbuild.Loader;
                if (file.language === 'typescript') {
                    loader = 'ts';
                } else if (file.language === 'json') {
                    loader = 'json';
                } else {
                    loader = 'js';
                }

                return {
                    contents: file.content,
                    loader: loader
                };
            });

            // Handle entry point resolution
            build.onResolve({ filter: /^entry$/ }, () => {
                return {
                    path: entryPoint,
                    namespace: 'plugin-vfs'
                };
            });
        }
    };

    const result = await esbuild.build({
        stdin: {
            contents: `export * from 'entry'`,
            resolveDir: '/',
            loader: 'js'
        },
        bundle: true,
        format: 'esm',
        target: 'es2020',
        write: false,
        plugins: [virtualFsPlugin],
    });

    if (result.outputFiles && result.outputFiles.length > 0) {
        return result.outputFiles[0].text;
    }

    throw new Error('No output generated');
}

const ctx = self as unknown as {
    postMessage: (message: PluginImportWorkerResponse) => void;
    addEventListener: typeof addEventListener;
};

ctx.addEventListener('message', (event: MessageEvent<PluginImportWorkerRequest>) => {
    const { data } = event;
    if (!data || data.type !== 'import') {
        return;
    }

    (async () => {
        try {
            ctx.postMessage({ type: 'progress', message: 'Odczytywanie pliku ZIP...' });
            const zip = await JSZip.loadAsync(data.file);

            // Try to find metadata from plugin.json
            let metadata: PluginMetadata | undefined;
            let pluginName = '';
            let entryPoint = '';
            let folders: string[] = [];

            const metadataFile = zip.file('plugin.json');
            if (metadataFile) {
                try {
                    const content = await metadataFile.async('string');
                    const parsed = JSON.parse(content);
                    pluginName = parsed.name || parsed.metadata?.name || '';
                    entryPoint = parsed.entryPoint || '';
                    folders = parsed.folders || [];
                    metadata = {
                        name: parsed.name || parsed.metadata?.name,
                        version: parsed.version || parsed.metadata?.version,
                        author: parsed.author || parsed.metadata?.author,
                        description: parsed.description || parsed.metadata?.description,
                    };
                } catch {
                    // Ignore metadata parse errors
                }
            }

            ctx.postMessage({ type: 'progress', message: 'Wypakowywanie plikow...' });

            // Extract all source files
            const files: Record<string, PluginFile> = {};
            const filePromises: Promise<void>[] = [];

            zip.forEach((relativePath, zipEntry) => {
                if (zipEntry.dir || relativePath === 'plugin.json') return;
                // Skip hidden files and node_modules
                if (relativePath.startsWith('.') || relativePath.includes('node_modules')) return;

                filePromises.push(
                    zipEntry.async('string').then(content => {
                        files[relativePath] = {
                            path: relativePath,
                            content,
                            language: getLanguageFromPath(relativePath),
                        };
                    })
                );
            });

            await Promise.all(filePromises);

            if (Object.keys(files).length === 0) {
                ctx.postMessage({
                    type: 'error',
                    message: 'Plik ZIP nie zawiera plikow zrodlowych.',
                });
                return;
            }

            // Try to determine entry point if not specified
            if (!entryPoint) {
                const possibleEntryPoints = ['index.ts', 'index.js', 'main.ts', 'main.js'];
                for (const ep of possibleEntryPoints) {
                    if (files[ep]) {
                        entryPoint = ep;
                        break;
                    }
                }
                // Fallback to first TypeScript or JavaScript file
                if (!entryPoint) {
                    const firstTsFile = Object.keys(files).find(f => f.endsWith('.ts'));
                    const firstJsFile = Object.keys(files).find(f => f.endsWith('.js'));
                    entryPoint = firstTsFile || firstJsFile || Object.keys(files)[0];
                }
            }

            // Use filename as plugin name if not specified
            if (!pluginName) {
                pluginName = entryPoint.replace(/\.(ts|js)$/, '');
            }

            ctx.postMessage({ type: 'progress', message: 'Inicjalizacja kompilatora...' });
            await initEsbuild();

            ctx.postMessage({ type: 'progress', message: 'Kompilowanie pluginu...' });
            const compiled = await bundlePlugin(files, entryPoint);

            const id = generatePluginId(pluginName);

            const result: PluginImportResult = {
                id,
                name: pluginName,
                compiled,
                files,
                folders,
                entryPoint,
                metadata,
            };

            ctx.postMessage({
                type: 'success',
                plugin: result,
            });
        } catch (error) {
            ctx.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Nie udalo sie zaimportowac pluginu.',
            });
        }
    })();
});

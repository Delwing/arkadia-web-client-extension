import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { globalStorage, characterStorage } from '@modules/core/storage';

// Stub the two collaborators so the test drives plugin lifecycle, not IndexedDB
// or real dynamic imports.
const loaded = new Set<string>();
const loadPlugin = vi.fn(async (url: string) => { loaded.add(url); });
const unloadPlugin = vi.fn(async (url: string) => { loaded.delete(url); });
let storedIds: string[] = [];

vi.mock('@client/PluginManager', () => ({
    PluginManager: class {
        loadPlugin = loadPlugin;
        unloadPlugin = unloadPlugin;
        isLoaded = (url: string) => loaded.has(url);
        getLoadedPlugins = () => [...loaded].map(url => ({ url }));
    },
}));
vi.mock('@client/utils/pluginStorage', () => ({
    getAllStoredPluginIds: () => Promise.resolve(storedIds),
}));

const initExternalScripts = (await import('@client/scripts/externalScripts')).default;

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('externalScripts', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        loaded.clear();
        loadPlugin.mockClear();
        unloadPlugin.mockClear();
        storedIds = [];
        client = createClient();
    });

    afterEach(() => vi.restoreAllMocks());

    test('loads the plugin urls already in storage', async () => {
        globalStorage.set('scripts', ['https://example.test/a.js'] as any);

        initExternalScripts(client);
        await flush();

        expect(loadPlugin).toHaveBeenCalledWith('https://example.test/a.js');
    });

    test('starts with nothing when storage is empty', async () => {
        initExternalScripts(client);
        await flush();

        expect(loadPlugin).not.toHaveBeenCalled();
    });

    test('loads plugins stored in the database', async () => {
        storedIds = ['stored:plugin-1'];

        initExternalScripts(client);
        await flush();

        expect(loadPlugin).toHaveBeenCalledWith('stored:plugin-1');
    });

    test('a url added later is loaded', async () => {
        initExternalScripts(client);
        await flush();

        globalStorage.set('scripts', ['https://example.test/b.js'] as any);
        await flush();

        expect(loadPlugin).toHaveBeenCalledWith('https://example.test/b.js');
    });

    test('a url removed from storage is unloaded', async () => {
        globalStorage.set('scripts', ['https://example.test/a.js'] as any);
        initExternalScripts(client);
        await flush();

        globalStorage.set('scripts', [] as any);
        await flush();

        expect(unloadPlugin).toHaveBeenCalledWith('https://example.test/a.js');
    });

    test('adding a second url keeps the first loaded', async () => {
        globalStorage.set('scripts', ['https://example.test/a.js'] as any);
        initExternalScripts(client);
        await flush();

        globalStorage.set('scripts', ['https://example.test/a.js', 'https://example.test/b.js'] as any);
        await flush();

        expect(loadPlugin).toHaveBeenCalledWith('https://example.test/b.js');
        expect(unloadPlugin).not.toHaveBeenCalledWith('https://example.test/a.js');
    });

    test('url plugins and stored plugins coexist', async () => {
        storedIds = ['stored:plugin-1'];
        globalStorage.set('scripts', ['https://example.test/a.js'] as any);

        initExternalScripts(client);
        await flush();

        expect(loadPlugin).toHaveBeenCalledWith('https://example.test/a.js');
        expect(loadPlugin).toHaveBeenCalledWith('stored:plugin-1');
        expect(unloadPlugin).not.toHaveBeenCalled();
    });

    test('an editor update re-reads the stored plugins', async () => {
        initExternalScripts(client);
        await flush();
        storedIds = ['stored:plugin-2'];

        window.dispatchEvent(new StorageEvent('storage', { key: 'stored_scripts_updated' }));
        await flush();

        expect(loadPlugin).toHaveBeenCalledWith('stored:plugin-2');
    });

    test('an unrelated storage event is ignored', async () => {
        initExternalScripts(client);
        await flush();
        loadPlugin.mockClear();
        storedIds = ['stored:plugin-3'];

        window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
        await flush();

        expect(loadPlugin).not.toHaveBeenCalled();
    });

    test('it hands back the plugin manager', () => {
        const manager = initExternalScripts(client);

        expect(manager).toBeDefined();
        expect(typeof manager.isLoaded).toBe('function');
    });
});

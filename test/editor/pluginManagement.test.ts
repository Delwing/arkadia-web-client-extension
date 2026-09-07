import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildPluginArchive, savePlugin } from '../../editor/pluginManagement';
import {
    getEditorPlugin,
    storeEditorPlugin,
    type EditorPluginData,
} from '@client/utils/pluginEditorStorage';

const PLUGIN_ID = 'editor_combat_alert';

function editorPlugin(overrides: Partial<EditorPluginData> = {}): EditorPluginData {
    const now = Date.now();
    return {
        id: PLUGIN_ID,
        name: 'Combat Alert',
        compiled: 'export async function init() { return {} }',
        files: { 'index.ts': { path: 'index.ts', content: 'export async function init() {}', language: 'typescript' } },
        folders: [],
        entryPoint: 'index.ts',
        createdAt: now,
        updatedAt: now,
        lastCompiledAt: now,
        ...overrides,
    };
}

/** savePlugin reads the name from the page and reports compilation there. */
function mountEditorChrome(name: string) {
    document.body.innerHTML = `
        <input id="plugin-name" value="${name}" />
        <div id="compile-status"></div>
    `;
}

const bundle = vi.fn(async () => 'export async function init() { return {} }');
const status = vi.fn();

describe('savePlugin', () => {
    beforeEach(() => {
        mountEditorChrome('Combat Alert');
        bundle.mockClear();
        status.mockClear();
    });

    it('keeps the catalogue link a publish stored, so the next release is an update', async () => {
        // What publishing does: writes the slug into the stored record only.
        await storeEditorPlugin(editorPlugin({ registrySlug: 'combat-alert' }));

        // What the editor holds: the copy loaded before the publish, with no slug.
        const inMemory = editorPlugin();
        await savePlugin(inMemory, PLUGIN_ID, '', new Set(), bundle, status);

        expect((await getEditorPlugin(PLUGIN_ID))?.registrySlug).toBe('combat-alert');
        // The live copy learns it too, so a second publish in the same session
        // does not depend on re-reading the database.
        expect(inMemory.registrySlug).toBe('combat-alert');
    });

    it('does not invent a catalogue link for a plugin that was never published', async () => {
        await storeEditorPlugin(editorPlugin());

        await savePlugin(editorPlugin(), PLUGIN_ID, '', new Set(), bundle, status);

        expect((await getEditorPlugin(PLUGIN_ID))?.registrySlug).toBeUndefined();
    });

    it('lets an explicit slug on the in-memory plugin win over the stored one', async () => {
        await storeEditorPlugin(editorPlugin({ registrySlug: 'old-slug' }));

        await savePlugin(editorPlugin({ registrySlug: 'new-slug' }), PLUGIN_ID, '', new Set(), bundle, status);

        expect((await getEditorPlugin(PLUGIN_ID))?.registrySlug).toBe('new-slug');
    });
});

describe('buildPluginArchive', () => {
    async function manifestOf(plugin: EditorPluginData) {
        const zip = await JSZip.loadAsync(await buildPluginArchive(plugin));
        return JSON.parse(await zip.file('plugin.json')!.async('string'));
    }

    it('never writes a version into plugin.json', async () => {
        // savePlugin stamps a fixed 1.0.0 that nobody typed. Carrying it into the
        // package makes the ZIP assert a version the code contradicts as soon as
        // the author bumps it in what init() returns, and the registry rejects
        // the release rather than guessing which one is right.
        const manifest = await manifestOf(
            editorPlugin({ metadata: { name: 'Combat Alert', version: '1.0.0', author: 'A', description: 'D' } })
        );

        expect(manifest.metadata).not.toHaveProperty('version');
        expect(manifest).not.toHaveProperty('version');
    });

    it('keeps the metadata that does describe the plugin', async () => {
        const manifest = await manifestOf(
            editorPlugin({ metadata: { name: 'Combat Alert', version: '1.0.0', author: 'QA', description: 'Sledzi walke.' } })
        );

        expect(manifest.name).toBe('Combat Alert');
        expect(manifest.entryPoint).toBe('index.ts');
        expect(manifest.metadata).toEqual({ name: 'Combat Alert', author: 'QA', description: 'Sledzi walke.' });
    });

    it('ships every source file so the package can be rebuilt', async () => {
        const zip = await JSZip.loadAsync(await buildPluginArchive(editorPlugin()));

        expect(zip.file('index.ts')).not.toBeNull();
    });
});

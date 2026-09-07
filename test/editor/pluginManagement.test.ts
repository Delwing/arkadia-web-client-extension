import { beforeEach, describe, expect, it, vi } from 'vitest';
import { savePlugin } from '../../editor/pluginManagement';
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

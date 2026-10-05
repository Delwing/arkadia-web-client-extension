import { describe, expect, it } from 'vitest';
import type { PluginFile } from '@client/utils/pluginEditorStorage';
import { baselineOf, cloneFiles, pathsCoveredBySave, structureChanged } from '../../editor/savedBaseline';

function files(entries: Record<string, string>): Record<string, PluginFile> {
    const out: Record<string, PluginFile> = {};
    for (const [path, content] of Object.entries(entries)) {
        out[path] = { path, content, language: 'typescript' };
    }
    return out;
}

describe('structureChanged', () => {
    const saved = files({ 'index.ts': 'a', 'lib/util.ts': 'b' });
    const baseline = baselineOf(saved, ['lib']);

    it('is false while only contents change', () => {
        expect(structureChanged(files({ 'index.ts': 'x', 'lib/util.ts': 'y' }), ['lib'], baseline)).toBe(false);
    });

    it('catches a new file, even an empty one', () => {
        expect(structureChanged(files({ 'index.ts': 'a', 'lib/util.ts': 'b', 'new.ts': '' }), ['lib'], baseline)).toBe(true);
    });

    it('catches a deleted file', () => {
        expect(structureChanged(files({ 'index.ts': 'a' }), ['lib'], baseline)).toBe(true);
    });

    it('catches a rename, which keeps the file count', () => {
        expect(structureChanged(files({ 'index.ts': 'a', 'lib/helpers.ts': 'b' }), ['lib'], baseline)).toBe(true);
    });

    it('catches folder changes', () => {
        expect(structureChanged(saved, ['lib', 'empty'], baseline)).toBe(true);
        expect(structureChanged(saved, ['tools'], baseline)).toBe(true);
    });

    it('has nothing to compare against before a plugin is loaded', () => {
        expect(structureChanged(saved, [], null)).toBe(false);
    });
});

describe('pathsCoveredBySave', () => {
    it('clears files that still hold what was saved, and keeps later edits modified', () => {
        const saved = files({ 'index.ts': 'v1', 'util.ts': 'u1' });
        const current = files({ 'index.ts': 'v1', 'util.ts': 'u2 typed during save' });

        expect(pathsCoveredBySave(['index.ts', 'util.ts'], current, saved)).toEqual(['index.ts']);
    });

    it('clears paths that no longer exist', () => {
        expect(pathsCoveredBySave(['gone.ts'], files({}), files({}))).toEqual(['gone.ts']);
    });
});

describe('cloneFiles', () => {
    it('copies each file, so later edits do not reach the copy', () => {
        const original = files({ 'index.ts': 'a' });
        const copy = cloneFiles(original);
        original['index.ts'].content = 'b';

        expect(copy['index.ts'].content).toBe('a');
    });
});

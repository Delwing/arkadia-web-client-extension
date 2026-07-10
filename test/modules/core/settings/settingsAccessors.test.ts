import { beforeEach, describe, expect, test, vi } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import {
    getRenderSettings,
    setRenderSettings,
    onRenderSettingsChange,
    getMapSettings,
} from '@modules/core/settings';
import { defaultRenderSettings } from '@shared/settingsDefaults';

beforeEach(() => localStorage.clear());

describe('settings accessors (Phase 1 — backed by uiSettings blob)', () => {
    test('get returns defaults when nothing is stored', () => {
        expect(getRenderSettings()).toEqual(defaultRenderSettings);
    });

    test('get merges stored fields over defaults', () => {
        globalStorage.set('uiSettings', { xtermPalette: 'proper' } as never);
        const r = getRenderSettings();
        expect(r.xtermPalette).toBe('proper');
        // untouched fields fall back to their defaults
        expect(r.contentFontSize).toBe(defaultRenderSettings.contentFontSize);
    });

    test('set merges without dropping sibling fields in the same slice', () => {
        setRenderSettings({ xtermPalette: 'proper' });
        setRenderSettings({ contentFontSize: 1.2 });
        const r = getRenderSettings();
        expect(r.xtermPalette).toBe('proper');
        expect(r.contentFontSize).toBe(1.2);
    });

    test('set preserves stock chrome fields and other slices', () => {
        globalStorage.set('uiSettings', {
            showButtons: false,      // chrome
            barOrder: ['hp'],        // chrome
            mapScale: 0.5,           // map slice
        } as never);

        setRenderSettings({ showTimestamps: true });

        const blob = globalStorage.get('uiSettings') as Record<string, unknown>;
        expect(blob.showButtons).toBe(false);
        expect(blob.barOrder).toEqual(['hp']);
        expect(blob.mapScale).toBe(0.5);
        expect(blob.showTimestamps).toBe(true);
        // the map accessor still sees its value
        expect(getMapSettings().mapScale).toBe(0.5);
    });

    test('set ignores foreign keys not owned by the slice', () => {
        // A render patch carrying a chrome key must not write that key.
        setRenderSettings({ showTimestamps: true, showButtons: false } as never);
        const blob = globalStorage.get('uiSettings') as Record<string, unknown>;
        expect(blob.showTimestamps).toBe(true);
        expect('showButtons' in blob).toBe(false);
    });

    test('onChange fires with the new slice value', () => {
        const cb = vi.fn();
        const off = onRenderSettingsChange(cb);
        setRenderSettings({ xtermPalette: 'proper' });
        expect(cb).toHaveBeenCalled();
        expect(cb.mock.calls.at(-1)![0].xtermPalette).toBe('proper');
        off();
    });
});

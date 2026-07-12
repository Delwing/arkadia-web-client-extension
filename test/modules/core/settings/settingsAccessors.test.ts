import { beforeEach, describe, expect, test, vi } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import {
    getRenderSettings,
    setRenderSettings,
    onRenderSettingsChange,
    getMapSettings,
    getDeviceViewSettings,
    setDeviceViewSettings,
} from '@modules/core/settings';
import { defaultRenderSettings, defaultDeviceViewSettings } from '@shared/settingsDefaults';

beforeEach(() => localStorage.clear());

describe('settings accessors (backed by own concern-scoped keys)', () => {
    test('get returns defaults when nothing is stored', () => {
        expect(getRenderSettings()).toEqual(defaultRenderSettings);
    });

    test('get merges stored fields over defaults', () => {
        globalStorage.set('renderSettings', { xtermPalette: 'proper' } as never);
        const r = getRenderSettings();
        expect(r.xtermPalette).toBe('proper');
        // untouched fields fall back to their defaults
        expect(r.commandEcho).toBe(defaultRenderSettings.commandEcho);
    });

    test('set merges without dropping sibling fields in the same slice', () => {
        setRenderSettings({ xtermPalette: 'proper' });
        setRenderSettings({ outputBottomPadding: 5 });
        const r = getRenderSettings();
        expect(r.xtermPalette).toBe('proper');
        expect(r.outputBottomPadding).toBe(5);
    });

    test('set writes only its own key, never uiSettings chrome or other slices', () => {
        globalStorage.set('uiSettings', { showButtons: false, barOrder: ['hp'] } as never);
        globalStorage.set('mapSettings', { mapRoomSize: 0.9 } as never);

        setRenderSettings({ showTimestamps: true });

        // its own key got the write
        expect((globalStorage.get('renderSettings') as Record<string, unknown>).showTimestamps).toBe(true);
        // uiSettings chrome untouched
        const chrome = globalStorage.get('uiSettings') as Record<string, unknown>;
        expect(chrome.showButtons).toBe(false);
        expect(chrome.barOrder).toEqual(['hp']);
        expect('showTimestamps' in chrome).toBe(false);
        // sibling slice untouched
        expect(getMapSettings().mapRoomSize).toBe(0.9);
    });

    test('device-view prefs are backed by the device-scoped uiSettings blob', () => {
        // Seed chrome so we can prove sibling chrome fields survive the write.
        globalStorage.set('uiSettings', { showButtons: false } as never);

        setDeviceViewSettings({ mapScale: 0.5, contentFontSize: 1.2 });

        // Written into uiSettings (device-scoped), NOT the synced render/map slices.
        const chrome = globalStorage.get('uiSettings') as Record<string, unknown>;
        expect(chrome.mapScale).toBe(0.5);
        expect(chrome.contentFontSize).toBe(1.2);
        expect(chrome.showButtons).toBe(false); // sibling chrome preserved
        expect(globalStorage.get('renderSettings')).toBeUndefined();
        expect(globalStorage.get('mapSettings')).toBeUndefined();

        const view = getDeviceViewSettings();
        expect(view.mapScale).toBe(0.5);
        expect(view.contentFontSize).toBe(1.2);
        // untouched field falls back to its default
        expect(view.outputMaxElements).toBe(defaultDeviceViewSettings.outputMaxElements);
    });

    test('set ignores foreign keys not owned by the slice', () => {
        setRenderSettings({ showTimestamps: true, showButtons: false } as never);
        const stored = globalStorage.get('renderSettings') as Record<string, unknown>;
        expect(stored.showTimestamps).toBe(true);
        expect('showButtons' in stored).toBe(false);
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

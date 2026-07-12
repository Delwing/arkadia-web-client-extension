import { beforeEach, describe, expect, test } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import { load, save } from '@web/uiSettingsCore';
import { migrateUiSettingsSplit } from '@modules/core/settingsMigrations';
import { defaultUiSettings } from '@web/defaultUiSettings';

beforeEach(() => localStorage.clear());

// End-to-end round-trip for the uiSettings split: the physical storage layout
// (device-scoped `uiSettings` blob + synced concern slices) must recompose into
// the unified UiSettings object the UI renders, without dropping or mis-mapping
// any field. This is the consumer path (load/save), complementing the storage-
// layer coverage in settingsMigrationsSplit.test.ts / settingsAccessors.test.ts.
describe('uiSettingsCore load()/save() round-trip', () => {
    // Representative non-default values spanning every slice + chrome + device-view.
    const tweaked = {
        ...defaultUiSettings,
        xtermPalette: 'proper',        // render slice (synced)
        showTimestamps: true,          // render slice
        mapLineColor: '#abcdef',       // map slice (synced)
        mapRoomShape: 'circle',        // map slice
        wakeLock: false,               // shell slice (synced)
        teamNumberingMode: 'numbers',  // behavior slice (synced)
        instantMove: false,            // behavior slice
        showButtons: false,            // chrome (device-scoped)
        footerMode: 2,                 // chrome
        contentFontSize: 1.4,          // device-view (device-scoped)
        mapScale: 0.55,                // device-view
        outputMaxElements: 500,        // device-view
    } as typeof defaultUiSettings;

    test('legacy uiSettings blob -> split migration -> load() preserves every field', () => {
        // Existing user sitting at the pre-split version with one monolithic blob.
        globalStorage.set('settingsMigrationsVersion', 9 as never);
        globalStorage.set('uiSettings', tweaked as never);

        migrateUiSettingsSplit();
        const loaded = load();

        // Every tweaked field survives the split + recompose.
        expect(loaded.xtermPalette).toBe('proper');
        expect(loaded.showTimestamps).toBe(true);
        expect(loaded.mapLineColor).toBe('#abcdef');
        expect(loaded.mapRoomShape).toBe('circle');
        expect(loaded.wakeLock).toBe(false);
        expect(loaded.teamNumberingMode).toBe('numbers');
        expect(loaded.instantMove).toBe(false);
        expect(loaded.showButtons).toBe(false);
        expect(loaded.footerMode).toBe(2);
        expect(loaded.contentFontSize).toBe(1.4);
        expect(loaded.mapScale).toBe(0.55);
        expect(loaded.outputMaxElements).toBe(500);

        // Synced fields moved out of the device-scoped blob into their slices...
        const chrome = globalStorage.get('uiSettings') as Record<string, unknown>;
        expect(chrome).not.toHaveProperty('xtermPalette');
        expect(chrome).not.toHaveProperty('mapLineColor');
        // ...but the device-scoped view prefs stayed behind in the blob.
        expect(chrome.contentFontSize).toBe(1.4);
        expect(chrome.mapScale).toBe(0.55);
        expect(chrome.outputMaxElements).toBe(500);
        expect(globalStorage.get('renderSettings')).not.toHaveProperty('contentFontSize');
        expect(globalStorage.get('renderSettings')).not.toHaveProperty('outputMaxElements');
        expect(globalStorage.get('mapSettings')).not.toHaveProperty('mapScale');
    });

    test('save() fans out to the right keys and load() reflects it', () => {
        save(tweaked);

        // Synced fields land in their slice keys.
        expect((globalStorage.get('renderSettings') as Record<string, unknown>).xtermPalette).toBe('proper');
        expect((globalStorage.get('mapSettings') as Record<string, unknown>).mapLineColor).toBe('#abcdef');
        // Device-view + chrome land in the device-scoped uiSettings blob.
        const chrome = globalStorage.get('uiSettings') as Record<string, unknown>;
        expect(chrome.contentFontSize).toBe(1.4);
        expect(chrome.mapScale).toBe(0.55);
        expect(chrome.outputMaxElements).toBe(500);
        expect(chrome.showButtons).toBe(false);
        // Slices never carry the device-view fields.
        expect(globalStorage.get('renderSettings')).not.toHaveProperty('contentFontSize');
        expect(globalStorage.get('mapSettings')).not.toHaveProperty('mapScale');

        // Round-trip: what save() wrote is what load() reads back.
        const loaded = load();
        expect(loaded.xtermPalette).toBe('proper');
        expect(loaded.mapLineColor).toBe('#abcdef');
        expect(loaded.contentFontSize).toBe(1.4);
        expect(loaded.mapScale).toBe(0.55);
        expect(loaded.outputMaxElements).toBe(500);
        expect(loaded.showButtons).toBe(false);
    });

    test('save() then load() is stable across a second cycle', () => {
        save(tweaked);
        const first = load();
        save(first);
        const second = load();
        expect(second).toEqual(first);
    });
});

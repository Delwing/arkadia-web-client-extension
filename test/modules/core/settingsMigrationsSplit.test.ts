import { beforeEach, describe, expect, test } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import { migrateUiSettingsSplit, migrateImportedValue } from '@modules/core/settingsMigrations';

beforeEach(() => localStorage.clear());

describe('migrateUiSettingsSplit', () => {
    test('moves fields into concern-scoped keys and leaves chrome in uiSettings', () => {
        // pre-split version so the gate opens
        globalStorage.set('settingsMigrationsVersion', 9 as never);
        globalStorage.set('uiSettings', {
            xtermPalette: 'proper',      // render
            mapLineColor: '#abcabc',     // map
            wakeLock: false,             // shell
            teamNumberingMode: 'numbers',// behavior
            showButtons: false,          // chrome (stays)
            barOrder: ['hp'],            // chrome (stays)
            // device-scoped view prefs — stay in the uiSettings blob (not synced)
            mapScale: 0.5,
            contentFontSize: 1.2,
            outputMaxElements: 500,
        } as never);

        migrateUiSettingsSplit();

        expect((globalStorage.get('renderSettings') as Record<string, unknown>).xtermPalette).toBe('proper');
        expect((globalStorage.get('mapSettings') as Record<string, unknown>).mapLineColor).toBe('#abcabc');
        expect((globalStorage.get('shellSettings') as Record<string, unknown>).wakeLock).toBe(false);
        expect((globalStorage.get('behaviorSettings') as Record<string, unknown>).teamNumberingMode).toBe('numbers');

        const chrome = globalStorage.get('uiSettings') as Record<string, unknown>;
        expect(chrome.showButtons).toBe(false);
        expect(chrome.barOrder).toEqual(['hp']);
        // moved fields removed from the blob
        expect('xtermPalette' in chrome).toBe(false);
        expect('mapLineColor' in chrome).toBe(false);
        expect('wakeLock' in chrome).toBe(false);
        expect('teamNumberingMode' in chrome).toBe(false);
        // device-scoped view prefs stay behind in the device-scoped blob
        expect(chrome.mapScale).toBe(0.5);
        expect(chrome.contentFontSize).toBe(1.2);
        expect(chrome.outputMaxElements).toBe(500);
        expect(globalStorage.get('mapSettings') as Record<string, unknown>).not.toHaveProperty('mapScale');
    });

    test('is idempotent — a second run changes nothing', () => {
        globalStorage.set('settingsMigrationsVersion', 9 as never);
        globalStorage.set('uiSettings', { xtermPalette: 'proper', showButtons: false } as never);

        migrateUiSettingsSplit();
        const renderAfterFirst = globalStorage.get('renderSettings');
        const chromeAfterFirst = globalStorage.get('uiSettings');

        // simulate the gate not yet bumped and run again
        globalStorage.set('settingsMigrationsVersion', 9 as never);
        migrateUiSettingsSplit();

        expect(globalStorage.get('renderSettings')).toEqual(renderAfterFirst);
        expect(globalStorage.get('uiSettings')).toEqual(chromeAfterFirst);
    });

    test('does not overwrite an already-populated slice key', () => {
        globalStorage.set('settingsMigrationsVersion', 9 as never);
        globalStorage.set('renderSettings', { xtermPalette: 'proper' } as never); // newer synced value
        globalStorage.set('uiSettings', { xtermPalette: 'arkadia' } as never);    // stale in blob

        migrateUiSettingsSplit();

        // existing slice key wins; stale blob field is still stripped
        expect((globalStorage.get('renderSettings') as Record<string, unknown>).xtermPalette).toBe('proper');
        expect('xtermPalette' in (globalStorage.get('uiSettings') as Record<string, unknown>)).toBe(false);
    });

    test('skips when the version gate is already past 10', () => {
        globalStorage.set('settingsMigrationsVersion', 10 as never);
        globalStorage.set('uiSettings', { xtermPalette: 'proper' } as never);
        migrateUiSettingsSplit();
        expect(globalStorage.get('renderSettings')).toBeUndefined();
    });

    test('migrateImportedValue splits a legacy uiSettings blob', () => {
        const raw = JSON.stringify({ xtermPalette: 'proper', showButtons: false });
        const out = JSON.parse(migrateImportedValue('uiSettings', raw));
        expect('xtermPalette' in out).toBe(false); // moved out
        expect(out.showButtons).toBe(false);       // chrome kept
        expect((globalStorage.get('renderSettings') as Record<string, unknown>).xtermPalette).toBe('proper');
    });
});

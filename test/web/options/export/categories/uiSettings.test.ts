/** uiSettings category: the device-scoped settings bundle. */

// Mock IndexedDB-dependent and external modules before importing the export modules
vi.mock('@web/dataStores/multibindStore', () => ({
    getSnapshot: jest.fn().mockResolvedValue([]),
    replaceAll: jest.fn().mockResolvedValue(undefined),
}));


vi.mock('@web/options/locationNotesStorage', () => ({
    exportNotes: jest.fn().mockResolvedValue([]),
    importNotes: jest.fn().mockResolvedValue(undefined),
    replaceAllNotes: jest.fn().mockResolvedValue(undefined),
}));

vi.mock('@client/scripts/killLifetimeStorage.ts', () => ({
    exportAllKillRecords: jest.fn().mockResolvedValue([]),
    importAllKillRecords: jest.fn().mockResolvedValue(undefined),
    migrateFromLocalStorage: jest.fn().mockResolvedValue(undefined),
}));

vi.mock('@client/scripts/profession', () => ({
    mergeProfessionStates: jest.fn((_local: unknown, cloud: unknown) => cloud),
}));

vi.mock('@modules/core/eventBus', () => ({
    __esModule: true,
    default: { emit: jest.fn() },
}));

vi.mock('@modules/device', () => ({
    getDeviceInfo: jest.fn(() => ({
        id: 'test-device',
        name: 'Test Device',
        type: 'desktop',
        os: 'Test OS',
        browser: 'Test Browser',
    })),
    saveImportedDevice: jest.fn(),
    getSyncGroup: jest.fn(() => null),
    triggerSettingsReload: jest.fn().mockResolvedValue(undefined),
    shouldApplyDeviceSettings: jest.fn(() => false),
    isCategoryDeviceScoped: jest.fn(() => false),
}));

import { exportCategory, importCategory } from '@web/options/export/categories.ts';
import { globalStorage } from '@modules/core/storage';

// ---------------------------------------------------------------------------
// uiSettings device bundle: tripRoutes + activeKeymap
// ---------------------------------------------------------------------------

describe('uiSettings category with tripRoutes and activeKeymap', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should export tripRoutes and the canonical active keymap id', async () => {
        localStorage.setItem('uiSettings', '{"theme":"dark"}');
        localStorage.setItem('tripRoutes', '[{"name":"route1"}]');
        globalStorage.set('active_keymap_id', 'keymap-1');

        const exported = await exportCategory('uiSettings', []);
        expect(exported).not.toBeNull();
        const parsed = JSON.parse(exported!);
        expect(parsed.tripRoutes).toBe('[{"name":"route1"}]');
        expect(parsed.activeKeymap).toBe('keymap-1');
    });

    it('should not include the active keymap when none is stored', async () => {
        localStorage.setItem('uiSettings', '{"theme":"dark"}');
        const exported = await exportCategory('uiSettings', []);
        const parsed = JSON.parse(exported!);
        expect(parsed).not.toHaveProperty('activeKeymap');
    });

    it('should import tripRoutes and the active keymap into the canonical key', async () => {
        const result = await importCategory('uiSettings', JSON.stringify({
            tripRoutes: '[{"name":"route2"}]',
            activeKeymap: 'keymap-2',
        }));
        expect(result.success).toBe(true);
        expect(localStorage.getItem('tripRoutes')).toBe('[{"name":"route2"}]');
        expect(globalStorage.get('active_keymap_id')).toBe('keymap-2');
    });

    it('should carry the widget layout with the device settings', async () => {
        const layout = '[{"id":"w1","type":"clock","corner":"tr","dx":12,"dy":12}]';
        localStorage.setItem('widgetLayout', layout);
        const parsed = JSON.parse((await exportCategory('uiSettings', []))!);
        expect(parsed.widgetLayout).toBe(layout);

        localStorage.clear();
        const result = await importCategory('uiSettings', JSON.stringify({ widgetLayout: layout }));
        expect(result.success).toBe(true);
        expect(globalStorage.get('widgetLayout')).toEqual(JSON.parse(layout));
    });

    it('should leave the widget layout alone when skipDeviceScoped is set', async () => {
        const result = await importCategory(
            'uiSettings',
            JSON.stringify({ widgetLayout: '[]' }),
            { skipDeviceScoped: true },
        );
        expect(result.success).toBe(true);
        expect(localStorage.getItem('widgetLayout')).toBeNull();
    });

    it('should skip tripRoutes and activeKeymap when skipDeviceScoped is set', async () => {
        const result = await importCategory(
            'uiSettings',
            JSON.stringify({ tripRoutes: '[]', activeKeymap: 'keymap-3' }),
            { skipDeviceScoped: true },
        );
        expect(result.success).toBe(true);
        expect(localStorage.getItem('tripRoutes')).toBeNull();
        expect(globalStorage.get('active_keymap_id')).toBeUndefined();
    });
});

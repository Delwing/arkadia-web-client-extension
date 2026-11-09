/** locationNotes sync category. */

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

vi.mock('@web/deviceSettingsReload.ts', () => ({
    triggerSettingsReload: jest.fn().mockResolvedValue(undefined),
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
    shouldApplyDeviceSettings: jest.fn(() => false),
    isCategoryDeviceScoped: jest.fn(() => false),
}));

import { exportCategory } from '@web/options/export/categories.ts';

describe('locationNotes sync category', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('exports nothing when there are no notes and notes never synced', async () => {
        expect(await exportCategory('locationNotes', [])).toBeNull();
    });

    it('exports an empty list once notes have synced, so deleting the last note propagates', async () => {
        localStorage.setItem('arkadia.firebaseSettings', JSON.stringify({
            categorySyncChecksums: { locationNotes: 'abc' },
        }));
        expect(await exportCategory('locationNotes', [])).toBe('[]');
    });
});

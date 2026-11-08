/** Building and restoring backup files (version 2). */

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

import { isBackupPayload, isRestorableBackup } from '@web/options/export/importValidator.ts';
import { buildBackup, restoreBackup, type BackupPayload } from '@web/options/export/backup.ts';
import { saveImportedDevice, shouldApplyDeviceSettings } from '@modules/device';
import { triggerSettingsReload } from '@web/deviceSettingsReload.ts';

// ---------------------------------------------------------------------------
// Backup files
// ---------------------------------------------------------------------------

describe('backup files', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.mocked(shouldApplyDeviceSettings).mockReturnValue(false);
        jest.mocked(saveImportedDevice).mockClear();
        jest.mocked(triggerSettingsReload).mockClear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('contains every category that has data, for all characters, with no selection', async () => {
        localStorage.setItem('triggers', JSON.stringify([{ pattern: 'test' }]));
        localStorage.setItem('binds', JSON.stringify({ F1: 'kondycja' }));
        localStorage.setItem('scripts', JSON.stringify(['https://example.com/plugin.js']));
        localStorage.setItem('Alice:settings', JSON.stringify({ shortenExits: true }));
        localStorage.setItem('Bob:settings', JSON.stringify({ shortenExits: false }));
        localStorage.setItem('Bob:peopleLocalEvents', JSON.stringify([{ id: 1 }]));

        const backup = await buildBackup();

        expect(backup.version).toBe(2);
        expect(backup.device.sourceDevice.id).toBe('test-device');
        expect(Object.keys(backup.categories)).toEqual(
            expect.arrayContaining(['triggers', 'binds', 'scripts', 'characterSettings', 'peopleEdits']),
        );
        const characters = JSON.parse(backup.categories.characterSettings!);
        expect(Object.keys(characters)).toEqual(['Alice', 'Bob']);
        expect(JSON.parse(backup.categories.scripts!)).toEqual({
            scripts: JSON.stringify(['https://example.com/plugin.js']),
        });
    });

    it('never contains excluded or unknown keys', async () => {
        localStorage.setItem('cachedMapData', 'big');
        localStorage.setItem('mapperRoomId', '123');
        localStorage.setItem('myArbitraryKey', 'value');
        localStorage.setItem('Alice:herbs_data', 'cached');
        localStorage.setItem('Alice:settings', JSON.stringify({ shortenExits: true }));

        const json = JSON.stringify(await buildBackup());

        expect(json).not.toContain('cachedMapData');
        expect(json).not.toContain('mapperRoomId');
        expect(json).not.toContain('myArbitraryKey');
        expect(json).not.toContain('herbs_data');
    });

    it('recognizes current and legacy backup files', async () => {
        const backup = await buildBackup();
        expect(isBackupPayload(backup)).toBe(true);
        expect(isRestorableBackup(backup)).toBe(true);

        const legacy = { version: 1, createdAt: 'x', localStorage: {}, indexedDB: {} };
        expect(isBackupPayload(legacy)).toBe(false);
        expect(isRestorableBackup(legacy)).toBe(true);

        expect(isRestorableBackup({ version: 2, createdAt: 'x', categories: {} })).toBe(false);
        expect(isRestorableBackup({ version: 3, createdAt: 'x', categories: {}, device: { sourceDevice: {} } })).toBe(false);
        expect(isRestorableBackup(null)).toBe(false);
    });

    it('round-trips shared data through a backup', async () => {
        localStorage.setItem('triggers', JSON.stringify([{ pattern: 'test' }]));
        localStorage.setItem('Alice:settings', JSON.stringify({ shortenExits: true }));
        const backup = JSON.parse(JSON.stringify(await buildBackup())) as BackupPayload;

        localStorage.clear();
        const result = await restoreBackup(backup);

        expect(result.deviceSettingsSavedToImportedList).toBe(false);
        expect(localStorage.getItem('triggers')).toBe(JSON.stringify([{ pattern: 'test' }]));
        expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ shortenExits: true }));
    });

    it('saves device settings from another device to the imported list instead of applying them', async () => {
        localStorage.setItem('uiSettings', JSON.stringify({ theme: 'dark' }));
        localStorage.setItem('desktopButtonSettings', JSON.stringify({ visible: true }));
        localStorage.setItem('mobileButtonSettings', JSON.stringify({ size: 2, radial: { items: [1] } }));
        const backup = await buildBackup();

        localStorage.clear();
        localStorage.setItem('uiSettings', JSON.stringify({ theme: 'light' }));
        const result = await restoreBackup(backup);

        expect(result.deviceSettingsSavedToImportedList).toBe(true);
        expect(localStorage.getItem('uiSettings')).toBe(JSON.stringify({ theme: 'light' }));
        const entry = jest.mocked(saveImportedDevice).mock.calls[0][0];
        expect(entry.deviceInfo.id).toBe('test-device');
        expect(entry.settings.uiSettings).toBe(JSON.stringify({ theme: 'dark' }));
        expect(entry.settings.desktopButtonSettings).toBe(JSON.stringify({ visible: true }));
        // The radial menu is a shared category but part of mobileButtonSettings locally
        expect(JSON.parse(entry.settings.mobileButtonSettings!)).toEqual({ size: 2, radial: { items: [1] } });
        // ...and as a shared category it is still restored here
        expect(JSON.parse(localStorage.getItem('mobileButtonSettings')!)).toEqual({ radial: { items: [1] } });
        expect(triggerSettingsReload).not.toHaveBeenCalled();
    });

    it('applies device settings from the same device or its sync group', async () => {
        jest.mocked(shouldApplyDeviceSettings).mockReturnValue(true);
        localStorage.setItem('uiSettings', JSON.stringify({ theme: 'dark' }));
        const backup = await buildBackup();

        localStorage.clear();
        const result = await restoreBackup(backup);

        expect(result.deviceSettingsSavedToImportedList).toBe(false);
        expect(localStorage.getItem('uiSettings')).toBe(JSON.stringify({ theme: 'dark' }));
        expect(saveImportedDevice).not.toHaveBeenCalled();
        expect(triggerSettingsReload).toHaveBeenCalled();
    });

    it('restores a legacy (version 1) backup file', async () => {
        const legacy = {
            version: 1 as const,
            createdAt: '2025-01-01T00:00:00.000Z',
            characters: ['Alice'],
            localStorage: {
                global: { triggers: JSON.stringify([{ pattern: 'old' }]) },
                characters: { Alice: { 'Alice:settings': JSON.stringify({ shortenExits: true }) } },
            },
            indexedDB: { multibinds: [], visitedRooms: [] },
        };

        await restoreBackup(legacy);

        expect(localStorage.getItem('triggers')).toBe(JSON.stringify([{ pattern: 'old' }]));
        expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ shortenExits: true }));
    });
});

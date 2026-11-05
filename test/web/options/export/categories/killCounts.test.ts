/** killCounts category. */

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

import { importCategory } from '@web/options/export/categories.ts';
import { importAllKillRecords, migrateFromLocalStorage } from '@client/scripts/killLifetimeStorage.ts';

// ---------------------------------------------------------------------------
// Kill records
// ---------------------------------------------------------------------------

describe('killCounts import', () => {
    it('migrates legacy totals of each character before importing records', async () => {
        const order: string[] = [];
        jest.mocked(migrateFromLocalStorage).mockImplementation(async (character: string) => { order.push(`migrate:${character}`); });
        jest.mocked(importAllKillRecords).mockImplementation(async () => { order.push('import'); });
        const records = [
            { id: '1', character: 'Alice', mob: 'orka', date: '2026/9/1', count: 2 },
            { id: '2', character: 'Bob', mob: 'elfa', date: '2026/9/1', count: 1 },
        ];

        const result = await importCategory('killCounts', JSON.stringify({ _v: 2, records }));

        expect(result.success).toBe(true);
        expect(order).toEqual(['migrate:Alice', 'migrate:Bob', 'import']);
    });
});

/** Restoring legacy (version 1) backup files. */

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

import { applyLocalStorageImport } from '@web/options/export/legacyBackup.ts';
import { restoreBackup } from '@web/options/export/backup.ts';
import { characterStorage, globalStorage } from '@modules/core/storage';
import { migrateFromLocalStorage } from '@client/scripts/killLifetimeStorage.ts';

// ---------------------------------------------------------------------------
// applyLocalStorageImport
// ---------------------------------------------------------------------------

describe('applyLocalStorageImport', () => {
    beforeEach(() => {
        localStorage.clear();
        // Reset characterStorage character for clean state
        characterStorage.setCharacter('');
    });

    it('should write global keys to localStorage', () => {
        applyLocalStorageImport({
            global: { triggers: JSON.stringify([{ pattern: 'x' }]) },
            characters: {},
        });
        expect(localStorage.getItem('triggers')).toBe(JSON.stringify([{ pattern: 'x' }]));
    });

    it('should write character-scoped keys to localStorage with full prefixed key', () => {
        applyLocalStorageImport({
            global: {},
            characters: {
                Alice: { 'Alice:settings': JSON.stringify({ theme: 'dark' }) },
            },
        });
        expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ theme: 'dark' }));
    });

    it('should auto-prefix character key if not already prefixed', () => {
        applyLocalStorageImport({
            global: {},
            characters: {
                Alice: { settings: JSON.stringify({ theme: 'light' }) },
            },
        });
        expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ theme: 'light' }));
    });

    it('should fire globalStorage listeners for changed global keys', () => {
        const listener = jest.fn();
        const unsubscribe = globalStorage.onChange('triggers', listener);
        applyLocalStorageImport({
            global: { triggers: JSON.stringify([{ pattern: 'y' }]) },
            characters: {},
        });
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it('should not fire globalStorage listeners when value is unchanged', () => {
        const raw = JSON.stringify([{ pattern: 'z' }]);
        localStorage.setItem('triggers', raw);
        const listener = jest.fn();
        const unsubscribe = globalStorage.onChange('triggers', listener);
        applyLocalStorageImport({
            global: { triggers: raw },
            characters: {},
        });
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
    });

    it('should fire characterStorage listeners for current character keys', () => {
        characterStorage.setCharacter('Alice');
        const listener = jest.fn();
        const unsubscribe = characterStorage.onChange('settings', listener);
        applyLocalStorageImport({
            global: {},
            characters: {
                Alice: { 'Alice:settings': JSON.stringify({ theme: 'dark' }) },
            },
        });
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        characterStorage.setCharacter('');
    });

    it('should not fire characterStorage listeners for a different character', () => {
        characterStorage.setCharacter('Alice');
        const listener = jest.fn();
        const unsubscribe = characterStorage.onChange('settings', listener);
        applyLocalStorageImport({
            global: {},
            characters: {
                Bob: { 'Bob:settings': JSON.stringify({ theme: 'dark' }) },
            },
        });
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
        characterStorage.setCharacter('');
    });

    it('should skip excluded keys during import', () => {
        applyLocalStorageImport({
            global: { cachedMapData: 'bigdata' },
            characters: {},
        });
        expect(localStorage.getItem('cachedMapData')).toBeNull();
    });

    it('should handle null/undefined data gracefully without throwing', () => {
        expect(() => applyLocalStorageImport(null as any)).not.toThrow();
        expect(() => applyLocalStorageImport(undefined as any)).not.toThrow();
    });

    it('should skip non-string values in global data', () => {
        applyLocalStorageImport({
            global: { triggers: 123 as any },
            characters: {},
        });
        expect(localStorage.getItem('triggers')).toBeNull();
    });
});

describe('legacy backup restore', () => {
    it('migrates each character\'s pre-IndexedDB kill totals before the file replaces them', async () => {
        const order: string[] = [];
        jest.mocked(migrateFromLocalStorage).mockImplementation(async (character: string) => {
            order.push(`migrate:${character}:${localStorage.getItem(`${character}:kill_counter`)}`);
        });
        localStorage.setItem('Alice:kill_counter', JSON.stringify({ orka: 3 }));

        await restoreBackup({
            version: 1,
            createdAt: '2025-01-01T00:00:00.000Z',
            characters: ['Alice'],
            localStorage: { global: {}, characters: { Alice: { 'Alice:kill_counter': JSON.stringify({ orka: 9 }) } } },
            indexedDB: { multibinds: [], visitedRooms: [], killRecords: [{ id: '1', character: 'Bob', mob: 'elfa', date: '2026/9/1', count: 1 }] },
        });

        // Alice migrated while her local totals were still there; Bob too
        expect(order).toEqual(['migrate:Alice:{"orka":3}', 'migrate:Bob:null']);
        expect(localStorage.getItem('Alice:kill_counter')).toBe(JSON.stringify({ orka: 9 }));
    });
});

/**
 * Unit tests for core export/import logic in src/web/options/exportUtils.ts
 *
 * Covers: parseCharacterStorageKey, isExcludedLocalStorageKey, collectCharacters,
 * applyLocalStorageImport, validatePayload, exportCategory, importCategory
 * round-trips, and backup files (buildBackup / restoreBackup).
 */

// Mock IndexedDB-dependent and external modules before importing exportUtils
vi.mock('@web/dataStores/multibindStore', () => ({
    getSnapshot: jest.fn().mockResolvedValue([]),
    replaceAll: jest.fn().mockResolvedValue(undefined),
}));


vi.mock('@web/options/locationNotesStorage', () => ({
    exportNotes: jest.fn().mockResolvedValue([]),
    importNotes: jest.fn().mockResolvedValue(undefined),
}));

vi.mock('@client/scripts/killLifetimeStorage.ts', () => ({
    exportAllKillRecords: jest.fn().mockResolvedValue([]),
    importAllKillRecords: jest.fn().mockResolvedValue(undefined),
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

import {
    parseCharacterStorageKey,
    isExcludedLocalStorageKey,
    collectCharacters,
    applyLocalStorageImport,
    validatePayload,
    exportCategory,
    importCategory,
    mergePerCharacterEnvelopes,
    buildBackup,
    isBackupPayload,
    isRestorableBackup,
    restoreBackup,
    type BackupPayload,
} from '@web/options/exportUtils';
import { characterStorage, globalStorage } from '@modules/core/storage';
import { SYNC_CATEGORIES } from '@modules/firebase/categoryRegistry';
import { saveImportedDevice, shouldApplyDeviceSettings, triggerSettingsReload } from '@modules/device';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// parseCharacterStorageKey
// ---------------------------------------------------------------------------

describe('parseCharacterStorageKey', () => {
    describe('when given a valid key', () => {
        it('should return name and baseKey for a known character-scoped key', () => {
            const result = parseCharacterStorageKey('Alice:settings');
            expect(result).toEqual({ name: 'Alice', baseKey: 'settings' });
        });

        it('should parse another known base key', () => {
            const result = parseCharacterStorageKey('Bob:kill_counter');
            expect(result).toEqual({ name: 'Bob', baseKey: 'kill_counter' });
        });

        it('should trim whitespace from the character name', () => {
            const result = parseCharacterStorageKey(' Alice :settings');
            expect(result).toEqual({ name: 'Alice', baseKey: 'settings' });
        });
    });

    describe('when given an invalid key', () => {
        it('should return null for empty string', () => {
            expect(parseCharacterStorageKey('')).toBeNull();
        });

        it('should return null for a URL-like key with ://', () => {
            expect(parseCharacterStorageKey('https://example.com')).toBeNull();
        });

        it('should return null for a http:// URL key', () => {
            expect(parseCharacterStorageKey('http://example.com/path')).toBeNull();
        });

        it('should return null for a key without a colon', () => {
            expect(parseCharacterStorageKey('settings')).toBeNull();
        });

        it('should return null when colon is at position 0 (empty character name)', () => {
            expect(parseCharacterStorageKey(':settings')).toBeNull();
        });

        it('should return null for a key whose base part is not a known character schema key', () => {
            expect(parseCharacterStorageKey('Alice:unknownKey')).toBeNull();
        });

        it('should return null for a key whose base part is a known global key (not character-scoped)', () => {
            // 'triggers' is a global key, not a character-scoped key
            expect(parseCharacterStorageKey('Alice:triggers')).toBeNull();
        });

        it('should return null when character name becomes empty after trimming', () => {
            expect(parseCharacterStorageKey('   :settings')).toBeNull();
        });
    });
});

// ---------------------------------------------------------------------------
// isExcludedLocalStorageKey
// ---------------------------------------------------------------------------

describe('isExcludedLocalStorageKey', () => {
    describe('excluded by explicit set', () => {
        it('should return true for cachedMapData', () => {
            expect(isExcludedLocalStorageKey('cachedMapData')).toBe(true);
        });

        it('should return true for cachedColors', () => {
            expect(isExcludedLocalStorageKey('cachedColors')).toBe(true);
        });

        it('should return true for magics', () => {
            expect(isExcludedLocalStorageKey('magics')).toBe(true);
        });

        it('should return true for magic_keys', () => {
            expect(isExcludedLocalStorageKey('magic_keys')).toBe(true);
        });

        it('should return true for herbs_data', () => {
            expect(isExcludedLocalStorageKey('herbs_data')).toBe(true);
        });

        it('should return true for mapperRoomId', () => {
            expect(isExcludedLocalStorageKey('mapperRoomId')).toBe(true);
        });
    });

    describe('excluded by URL prefix', () => {
        it('should return true for a http:// prefixed key', () => {
            expect(isExcludedLocalStorageKey('http://example.com')).toBe(true);
        });

        it('should return true for a https:// prefixed key', () => {
            expect(isExcludedLocalStorageKey('https://cdn.example.com/cache')).toBe(true);
        });
    });

    describe('not excluded', () => {
        it('should return false for triggers', () => {
            expect(isExcludedLocalStorageKey('triggers')).toBe(false);
        });

        it('should return false for aliases', () => {
            expect(isExcludedLocalStorageKey('aliases')).toBe(false);
        });

        it('should return false for uiSettings', () => {
            expect(isExcludedLocalStorageKey('uiSettings')).toBe(false);
        });

        it('should return false for settings (character-scoped base key)', () => {
            expect(isExcludedLocalStorageKey('settings')).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// collectCharacters
// ---------------------------------------------------------------------------

describe('collectCharacters', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should return empty array when localStorage has no character data', () => {
        expect(collectCharacters()).toEqual([]);
    });

    it('should find a single character name', () => {
        localStorage.setItem('Alice:settings', JSON.stringify({}));
        expect(collectCharacters()).toEqual(['Alice']);
    });

    it('should find multiple distinct character names', () => {
        localStorage.setItem('Alice:settings', JSON.stringify({}));
        localStorage.setItem('Bob:kill_counter', JSON.stringify({}));
        const result = collectCharacters();
        expect(result).toContain('Alice');
        expect(result).toContain('Bob');
        expect(result).toHaveLength(2);
    });

    it('should deduplicate character names when multiple keys exist for the same character', () => {
        localStorage.setItem('Alice:settings', JSON.stringify({}));
        localStorage.setItem('Alice:kill_counter', JSON.stringify({}));
        expect(collectCharacters()).toEqual(['Alice']);
    });

    it('should return names sorted alphabetically (case-insensitive)', () => {
        localStorage.setItem('Zebra:settings', JSON.stringify({}));
        localStorage.setItem('alice:settings', JSON.stringify({}));
        localStorage.setItem('Bob:settings', JSON.stringify({}));
        const result = collectCharacters();
        expect(result[0].toLowerCase()).toBe('alice');
        expect(result[1].toLowerCase()).toBe('bob');
        expect(result[2].toLowerCase()).toBe('zebra');
    });

    it('should ignore global (non-character-scoped) keys', () => {
        localStorage.setItem('triggers', JSON.stringify([]));
        localStorage.setItem('uiSettings', JSON.stringify({}));
        expect(collectCharacters()).toEqual([]);
    });

    it('should ignore keys with unknown base parts', () => {
        localStorage.setItem('Alice:unknownKey', 'value');
        expect(collectCharacters()).toEqual([]);
    });

    it('should ignore URL-like keys', () => {
        localStorage.setItem('https://example.com', 'value');
        expect(collectCharacters()).toEqual([]);
    });
});

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

// ---------------------------------------------------------------------------
// validatePayload
// ---------------------------------------------------------------------------

describe('validatePayload', () => {
    const validPayload = {
        version: 1 as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        characters: [],
        localStorage: { global: {}, characters: {} },
        indexedDB: { multibinds: [], visitedRooms: [] },
    };

    it('should return true for a valid payload', () => {
        expect(validatePayload(validPayload)).toBe(true);
    });

    it('should return false for null', () => {
        expect(validatePayload(null)).toBe(false);
    });

    it('should return false for undefined', () => {
        expect(validatePayload(undefined)).toBe(false);
    });

    it('should return false for a plain string', () => {
        expect(validatePayload('not an object')).toBe(false);
    });

    it('should return false when version is not 1', () => {
        expect(validatePayload({ ...validPayload, version: 2 })).toBe(false);
    });

    it('should return false when version is missing', () => {
        const { version: _v, ...rest } = validPayload;
        expect(validatePayload(rest)).toBe(false);
    });

    it('should return false when createdAt is not a string', () => {
        expect(validatePayload({ ...validPayload, createdAt: 12345 })).toBe(false);
    });

    it('should return false when createdAt is missing', () => {
        const { createdAt: _c, ...rest } = validPayload;
        expect(validatePayload(rest)).toBe(false);
    });

    it('should return false when localStorage is missing', () => {
        const { localStorage: _ls, ...rest } = validPayload;
        expect(validatePayload(rest)).toBe(false);
    });

    it('should return false when localStorage is not an object', () => {
        expect(validatePayload({ ...validPayload, localStorage: 'data' })).toBe(false);
    });

    it('should return false when indexedDB is missing', () => {
        const { indexedDB: _idb, ...rest } = validPayload;
        expect(validatePayload(rest)).toBe(false);
    });

    it('should return false when indexedDB is not an object', () => {
        expect(validatePayload({ ...validPayload, indexedDB: null })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// exportCategory / importCategory round-trips
// ---------------------------------------------------------------------------

describe('exportCategory and importCategory', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    // ------------------------------------------------------------------
    // triggers
    // ------------------------------------------------------------------

    describe('triggers', () => {
        it('should export and import triggers round-trip', async () => {
            const triggers = JSON.stringify([{ pattern: '^kill', command: 'attack' }]);
            localStorage.setItem('triggers', triggers);

            const exported = await exportCategory('triggers', []);
            expect(exported).not.toBeNull();

            localStorage.removeItem('triggers');
            const result = await importCategory('triggers', exported!);
            expect(result.success).toBe(true);
            expect(localStorage.getItem('triggers')).toBe(triggers);
        });

        it('should return null when no triggers are stored', async () => {
            const exported = await exportCategory('triggers', []);
            expect(exported).toBeNull();
        });
    });

    // ------------------------------------------------------------------
    // aliases
    // ------------------------------------------------------------------

    describe('aliases', () => {
        it('should export and import aliases round-trip', async () => {
            const aliases = JSON.stringify([{ pattern: '^inv$', command: 'inventory' }]);
            localStorage.setItem('aliases', aliases);

            const exported = await exportCategory('aliases', []);
            expect(exported).not.toBeNull();

            localStorage.removeItem('aliases');
            const result = await importCategory('aliases', exported!);
            expect(result.success).toBe(true);
            expect(localStorage.getItem('aliases')).toBe(aliases);
        });

        it('should return null when no aliases are stored', async () => {
            const exported = await exportCategory('aliases', []);
            expect(exported).toBeNull();
        });
    });

    // ------------------------------------------------------------------
    // binds
    // ------------------------------------------------------------------

    describe('binds', () => {
        it('should export and import binds and keymaps round-trip', async () => {
            const bindsValue = JSON.stringify({ F1: 'north' });
            const keymapsValue = JSON.stringify({ default: {} });
            localStorage.setItem('binds', bindsValue);
            localStorage.setItem('keymaps', keymapsValue);

            const exported = await exportCategory('binds', []);
            expect(exported).not.toBeNull();

            localStorage.removeItem('binds');
            localStorage.removeItem('keymaps');
            const result = await importCategory('binds', exported!);
            expect(result.success).toBe(true);
            expect(localStorage.getItem('binds')).toBe(bindsValue);
            expect(localStorage.getItem('keymaps')).toBe(keymapsValue);
        });

        it('should export only binds if keymaps is absent', async () => {
            localStorage.setItem('binds', JSON.stringify({ F2: 'south' }));
            const exported = await exportCategory('binds', []);
            expect(exported).not.toBeNull();
            const parsed = JSON.parse(exported!);
            expect(parsed).toHaveProperty('binds');
            expect(parsed).not.toHaveProperty('keymaps');
        });

        it('should return null when neither binds nor keymaps are stored', async () => {
            const exported = await exportCategory('binds', []);
            expect(exported).toBeNull();
        });
    });

    // ------------------------------------------------------------------
    // shortcuts
    // ------------------------------------------------------------------

    describe('shortcuts', () => {
        it('should export and import shortcuts round-trip', async () => {
            const shortcuts = JSON.stringify({ ctrl_a: 'selectAll' });
            localStorage.setItem('shortcuts', shortcuts);

            const exported = await exportCategory('shortcuts', []);
            expect(exported).not.toBeNull();

            localStorage.removeItem('shortcuts');
            const result = await importCategory('shortcuts', exported!);
            expect(result.success).toBe(true);
            expect(localStorage.getItem('shortcuts')).toBe(shortcuts);
        });

        it('should return null when no shortcuts are stored', async () => {
            const exported = await exportCategory('shortcuts', []);
            expect(exported).toBeNull();
        });
    });

    // ------------------------------------------------------------------
    // uiSettings
    // ------------------------------------------------------------------

    describe('uiSettings', () => {
        it('should capture uiSettings and layoutManagerState', async () => {
            const ui = JSON.stringify({ theme: 'dark' });
            const layout = JSON.stringify({ panels: [] });
            localStorage.setItem('uiSettings', ui);
            localStorage.setItem('layoutManagerState', layout);

            const exported = await exportCategory('uiSettings', []);
            expect(exported).not.toBeNull();
            const parsed = JSON.parse(exported!);
            expect(parsed).toHaveProperty('uiSettings', ui);
            expect(parsed).toHaveProperty('layoutManagerState', layout);
        });

        it('should capture loggingEnabled', async () => {
            localStorage.setItem('loggingEnabled', 'true');
            const exported = await exportCategory('uiSettings', []);
            expect(exported).not.toBeNull();
            const parsed = JSON.parse(exported!);
            expect(parsed).toHaveProperty('loggingEnabled', 'true');
        });

        it('should NOT capture button settings (owned by buttons / radial categories)', async () => {
            localStorage.setItem('desktopButtonSettings', JSON.stringify({ layout: 'standard' }));
            localStorage.setItem('mobileButtonSettings', JSON.stringify({ layout: 'compact' }));
            const exported = await exportCategory('uiSettings', []);
            // Only button data present -> nothing for uiSettings to export
            expect(exported).toBeNull();
        });

        it('should not write button settings when importing a uiSettings payload', async () => {
            const result = await importCategory('uiSettings', JSON.stringify({
                uiSettings: JSON.stringify({ theme: 'dark' }),
                desktopButtonSettings: JSON.stringify({ layout: 'standard' }),
                mobileButtonSettings: JSON.stringify({ layout: 'compact' }),
            }));
            expect(result.success).toBe(true);
            expect(localStorage.getItem('uiSettings')).toBe(JSON.stringify({ theme: 'dark' }));
            // Legacy button fields in the payload are ignored
            expect(localStorage.getItem('desktopButtonSettings')).toBeNull();
            expect(localStorage.getItem('mobileButtonSettings')).toBeNull();
        });

        it('should return null when no uiSettings data is stored', async () => {
            const exported = await exportCategory('uiSettings', []);
            expect(exported).toBeNull();
        });
    });

    // ------------------------------------------------------------------
    // characterSettings
    // ------------------------------------------------------------------

    describe('characterSettings', () => {
        it('should export character-scoped keys for selected characters', async () => {
            localStorage.setItem('Alice:settings', JSON.stringify({ font: 'mono' }));
            localStorage.setItem('Bob:settings', JSON.stringify({ font: 'sans' }));

            const exported = await exportCategory('characterSettings', ['Alice']);
            expect(exported).not.toBeNull();
            const parsed = JSON.parse(exported!);
            expect(parsed).toHaveProperty('Alice');
            expect(parsed).not.toHaveProperty('Bob');
        });

        it('should import character settings correctly', async () => {
            const charData = JSON.stringify({
                Alice: { 'Alice:settings': JSON.stringify({ font: 'serif' }) },
            });
            const result = await importCategory('characterSettings', charData);
            expect(result.success).toBe(true);
            expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ font: 'serif' }));
        });

        it('should return null when no character data for selected characters exists', async () => {
            const exported = await exportCategory('characterSettings', ['NoSuchChar']);
            expect(exported).toBeNull();
        });
    });

    // ------------------------------------------------------------------
    // buttons
    // ------------------------------------------------------------------

    describe('buttons', () => {
        it('should export mobileButtonSettings without radial, and desktopButtonSettings', async () => {
            const mobile = JSON.stringify({ layout: 'grid', radial: { slots: [] } });
            const desktop = JSON.stringify({ layout: 'bar' });
            localStorage.setItem('mobileButtonSettings', mobile);
            localStorage.setItem('desktopButtonSettings', desktop);

            const exported = await exportCategory('buttons', []);
            expect(exported).not.toBeNull();
            const parsed = JSON.parse(exported!);
            expect(parsed).toHaveProperty('mobileButtonSettings');
            expect(parsed).toHaveProperty('desktopButtonSettings');
            // radial should be stripped from mobileButtonSettings
            const mobileExported = JSON.parse(parsed.mobileButtonSettings);
            expect(mobileExported).not.toHaveProperty('radial');
            expect(mobileExported).toHaveProperty('layout', 'grid');
        });

        it('should merge incoming mobileButtonSettings with existing, preserving radial', async () => {
            const existingMobile = JSON.stringify({ layout: 'grid', radial: { slots: [1, 2] } });
            localStorage.setItem('mobileButtonSettings', existingMobile);

            const importData = JSON.stringify({
                mobileButtonSettings: JSON.stringify({ layout: 'list', count: 5 }),
            });
            const result = await importCategory('buttons', importData);
            expect(result.success).toBe(true);

            const merged = JSON.parse(localStorage.getItem('mobileButtonSettings')!);
            // Existing radial preserved
            expect(merged).toHaveProperty('radial');
            // Incoming values applied
            expect(merged.layout).toBe('list');
            expect(merged.count).toBe(5);
        });

        it('should return null when neither mobile nor desktop settings are stored', async () => {
            const exported = await exportCategory('buttons', []);
            expect(exported).toBeNull();
        });
    });

    // ------------------------------------------------------------------
    // radial
    // ------------------------------------------------------------------

    describe('radial', () => {
        it('should export only radial portion from mobileButtonSettings', async () => {
            const mobile = JSON.stringify({ layout: 'grid', radial: { slots: [{ id: 1 }] } });
            localStorage.setItem('mobileButtonSettings', mobile);

            const exported = await exportCategory('radial', []);
            expect(exported).not.toBeNull();
            const parsed = JSON.parse(exported!);
            expect(parsed).toHaveProperty('radial');
            expect(parsed.radial).toEqual({ slots: [{ id: 1 }] });
        });

        it('should return null when mobileButtonSettings has no radial', async () => {
            localStorage.setItem('mobileButtonSettings', JSON.stringify({ layout: 'grid' }));
            const exported = await exportCategory('radial', []);
            expect(exported).toBeNull();
        });

        it('should return null when mobileButtonSettings is not set', async () => {
            const exported = await exportCategory('radial', []);
            expect(exported).toBeNull();
        });

        it('should merge radial into existing mobileButtonSettings on import', async () => {
            const existingMobile = JSON.stringify({ layout: 'grid', count: 3 });
            localStorage.setItem('mobileButtonSettings', existingMobile);

            const importData = JSON.stringify({ radial: { slots: [{ id: 99 }] } });
            const result = await importCategory('radial', importData);
            expect(result.success).toBe(true);

            const merged = JSON.parse(localStorage.getItem('mobileButtonSettings')!);
            expect(merged.radial).toEqual({ slots: [{ id: 99 }] });
            expect(merged.layout).toBe('grid');
            expect(merged.count).toBe(3);
        });

        it('should create mobileButtonSettings with radial when none existed before', async () => {
            const importData = JSON.stringify({ radial: { slots: [{ id: 1 }] } });
            const result = await importCategory('radial', importData);
            expect(result.success).toBe(true);
            const stored = JSON.parse(localStorage.getItem('mobileButtonSettings')!);
            expect(stored.radial).toEqual({ slots: [{ id: 1 }] });
        });
    });

    // ------------------------------------------------------------------
    // improveCounts
    // ------------------------------------------------------------------

    describe('improveCounts', () => {
        it('should export improve_counter_lifetime keys for selected characters', async () => {
            localStorage.setItem('Alice:improve_counter_lifetime', JSON.stringify({ sword: 5 }));
            localStorage.setItem('Bob:improve_counter_lifetime', JSON.stringify({ axe: 3 }));

            const exported = await exportCategory('improveCounts', ['Alice']);
            expect(exported).not.toBeNull();
            const parsed = JSON.parse(exported!);
            expect(parsed).toHaveProperty('Alice');
            expect(parsed).not.toHaveProperty('Bob');
        });

        it('should import improve_counter_lifetime as CharName:improve_counter_lifetime', async () => {
            const importData = JSON.stringify({
                Alice: JSON.stringify({ sword: 10 }),
            });
            const result = await importCategory('improveCounts', importData);
            expect(result.success).toBe(true);
            expect(localStorage.getItem('Alice:improve_counter_lifetime')).toBe(JSON.stringify({ sword: 10 }));
        });

        it('should return null when no improve_counter_lifetime data exists', async () => {
            const exported = await exportCategory('improveCounts', ['NoChar']);
            expect(exported).toBeNull();
        });
    });

    // ------------------------------------------------------------------
    // deposits
    // ------------------------------------------------------------------

    describe('deposits', () => {
        it('should export deposits keys for selected characters', async () => {
            localStorage.setItem('Alice:deposits', JSON.stringify({ bank: 500 }));

            const exported = await exportCategory('deposits', ['Alice']);
            expect(exported).not.toBeNull();
            const parsed = JSON.parse(exported!);
            expect(parsed).toHaveProperty('Alice');
        });

        it('should import deposits as CharName:deposits', async () => {
            const importData = JSON.stringify({
                Bob: JSON.stringify({ bank: 100 }),
            });
            const result = await importCategory('deposits', importData);
            expect(result.success).toBe(true);
            expect(localStorage.getItem('Bob:deposits')).toBe(JSON.stringify({ bank: 100 }));
        });

        it('should return null when no deposits data exists for selected characters', async () => {
            const exported = await exportCategory('deposits', ['NoChar']);
            expect(exported).toBeNull();
        });
    });

    // ------------------------------------------------------------------
    // importCategory - unknown category
    // ------------------------------------------------------------------

    describe('importCategory with unknown category', () => {
        it('should return success:false with error message for an unknown category', async () => {
            const result = await importCategory('unknownCategory' as any, JSON.stringify({}));
            expect(result.success).toBe(false);
            expect(result.error).toContain('Unknown category');
            expect(result.error).toContain('unknownCategory');
        });
    });

    // ------------------------------------------------------------------
    // importCategory - success result
    // ------------------------------------------------------------------

    describe('importCategory success result', () => {
        it('should return success:true for a valid triggers import', async () => {
            const result = await importCategory(
                'triggers',
                JSON.stringify({ triggers: JSON.stringify([]) })
            );
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
        });
    });
});

// ---------------------------------------------------------------------------
// Registry-driven generic categories
// ---------------------------------------------------------------------------

describe('registry-driven generic categories', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should export binds in the historical {binds, keymaps} shape and key order', async () => {
        localStorage.setItem('binds', 'BINDS_RAW');
        localStorage.setItem('keymaps', 'KEYMAPS_RAW');
        const exported = await exportCategory('binds', []);
        expect(exported).toBe(JSON.stringify({ binds: 'BINDS_RAW', keymaps: 'KEYMAPS_RAW' }));
    });

    it('should export single-key categories in the historical shape', async () => {
        localStorage.setItem('triggers', 'T_RAW');
        localStorage.setItem('aliases', 'A_RAW');
        localStorage.setItem('shortcuts', 'S_RAW');
        expect(await exportCategory('triggers', [])).toBe(JSON.stringify({ triggers: 'T_RAW' }));
        expect(await exportCategory('aliases', [])).toBe(JSON.stringify({ aliases: 'A_RAW' }));
        expect(await exportCategory('shortcuts', [])).toBe(JSON.stringify({ shortcuts: 'S_RAW' }));
    });

    it('should import binds and keymaps from a binds payload', async () => {
        const result = await importCategory('binds', JSON.stringify({ binds: 'B2', keymaps: 'K2' }));
        expect(result.success).toBe(true);
        expect(localStorage.getItem('binds')).toBe('B2');
        expect(localStorage.getItem('keymaps')).toBe('K2');
    });

    it('should export character-scoped categories only for selected characters', async () => {
        localStorage.setItem('Alice:containers', 'C_ALICE');
        localStorage.setItem('Bob:containers', 'C_BOB');
        const exported = await exportCategory('containers', ['Alice']);
        expect(exported).toBe(JSON.stringify({ Alice: 'C_ALICE' }));
    });

    it('should import character-scoped categories under the declared base key', async () => {
        const result = await importCategory('peopleEdits', JSON.stringify({ Alice: 'P_RAW' }));
        expect(result.success).toBe(true);
        expect(localStorage.getItem('Alice:peopleLocalEvents')).toBe('P_RAW');
    });

    it('should return null when no data exists for a generic category', async () => {
        expect(await exportCategory('triggers', [])).toBeNull();
        expect(await exportCategory('containers', ['Alice'])).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Canonical export ordering (checksum stability across devices)
// ---------------------------------------------------------------------------

describe('canonical export ordering', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should export character-scoped categories with sorted character names regardless of insertion order', async () => {
        localStorage.setItem('Zoe:deposits', 'Z');
        localStorage.setItem('Alice:deposits', 'A');
        localStorage.setItem('Mira:deposits', 'M');

        const exported = await exportCategory('deposits', ['Zoe', 'Alice', 'Mira']);
        expect(exported).toBe(JSON.stringify({ Alice: 'A', Mira: 'M', Zoe: 'Z' }));
    });

    it('should export characterSettings with sorted characters and sorted keys within each', async () => {
        localStorage.setItem('Zoe:settings', 'zs');
        localStorage.setItem('Alice:settings', 'as');
        localStorage.setItem('Alice:kill_counter', 'ak');

        const exported = await exportCategory('characterSettings', ['Zoe', 'Alice']);
        expect(exported).toBe(JSON.stringify({
            Alice: { 'Alice:kill_counter': 'ak', 'Alice:settings': 'as' },
            Zoe: { 'Zoe:settings': 'zs' },
        }));
    });
});

// ---------------------------------------------------------------------------
// visitedRooms union import
// ---------------------------------------------------------------------------

describe('importVisitedRooms union semantics', () => {
    it('unions imported rooms with locally visited rooms instead of replacing them', async () => {
        const { importVisitedRooms, exportVisitedRooms } = await import('@web/options/exportUtils');
        const id = `UnionChar_${Date.now()}:map`;
        const character = id.split(':')[0];

        await importVisitedRooms([{ id, rooms: [1, 2, 3] }]);
        // Second import (e.g. cloud data missing locally-explored rooms 2 and 3)
        await importVisitedRooms([{ id, rooms: [3, 4] }]);

        const exported = await exportVisitedRooms([character]);
        const entry = exported.find(e => e.id === id);
        expect(entry?.rooms).toEqual([1, 2, 3, 4]);
    });
});

// ---------------------------------------------------------------------------
// mergePerCharacterEnvelopes
// ---------------------------------------------------------------------------

describe('mergePerCharacterEnvelopes', () => {
    it('keeps the preferred side for characters present in both envelopes', () => {
        const merged = mergePerCharacterEnvelopes(
            JSON.stringify({ Alice: 'local' }),
            JSON.stringify({ Alice: 'cloud' }),
        );
        expect(JSON.parse(merged)).toEqual({ Alice: 'local' });
    });

    it('keeps characters exclusive to either side', () => {
        const merged = mergePerCharacterEnvelopes(
            JSON.stringify({ Alice: 'local' }),
            JSON.stringify({ Bob: 'cloud' }),
        );
        expect(JSON.parse(merged)).toEqual({ Alice: 'local', Bob: 'cloud' });
    });

    it('produces canonical (sorted) key order', () => {
        const merged = mergePerCharacterEnvelopes(
            JSON.stringify({ Zoe: 'z' }),
            JSON.stringify({ Alice: 'a' }),
        );
        expect(merged).toBe(JSON.stringify({ Alice: 'a', Zoe: 'z' }));
    });

    it('returns the preferred JSON unchanged when the other side is invalid', () => {
        const preferred = JSON.stringify({ Alice: 'local' });
        expect(mergePerCharacterEnvelopes(preferred, 'not-json')).toBe(preferred);
    });

    it('returns the preferred JSON unchanged when either side is not an object', () => {
        const preferred = JSON.stringify({ Alice: 'local' });
        expect(mergePerCharacterEnvelopes(preferred, JSON.stringify([1, 2]))).toBe(preferred);
    });
});

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

// ---------------------------------------------------------------------------
// Assistant BYOK key must never leave the device
// ---------------------------------------------------------------------------

describe('assistant BYOK key', () => {
    const SENTINEL = 'sk-do-not-upload-me-0123456789';

    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('is absent from the backup file', async () => {
        localStorage.setItem('arkadia.assistantApiKey', SENTINEL);
        localStorage.setItem('triggers', JSON.stringify([{ pattern: 'x' }]));

        const backup = await buildBackup();

        expect(JSON.stringify(backup)).not.toContain(SENTINEL);
    });

    it('is absent from every cloud sync category', async () => {
        localStorage.setItem('arkadia.assistantApiKey', SENTINEL);
        // Seed something in each backing store so the exporters have work to do.
        localStorage.setItem('triggers', JSON.stringify([{ pattern: 'x' }]));
        localStorage.setItem('aliases', JSON.stringify([{ pattern: 'y', command: 'z' }]));
        localStorage.setItem('uiSettings', JSON.stringify({ theme: 'dark' }));
        localStorage.setItem('Alice:settings', JSON.stringify({ shortenExits: true }));

        const exported = await Promise.all(
            SYNC_CATEGORIES.map(category => exportCategory(category, ['Alice'])),
        );

        expect(JSON.stringify(exported)).not.toContain(SENTINEL);
    });

    it('is not a character-scoped key, so characterSettings cannot pick it up', async () => {
        // The character path is a DENYLIST: exportCategory('characterSettings')
        // uploads every `<Char>:<baseKey>` whose base key is in
        // characterStorageKeys and not excluded. Storing the key per character
        // would silently enrol it.
        localStorage.setItem('Alice:arkadia.assistantApiKey', SENTINEL);
        localStorage.setItem('Alice:settings', JSON.stringify({ shortenExits: true }));

        const exported = await exportCategory('characterSettings', ['Alice']);

        expect(exported ?? '').not.toContain(SENTINEL);
    });
});

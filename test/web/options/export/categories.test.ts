/** exportCategory / importCategory round-trips over the category registry. */

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
import { buildBackup } from '@web/options/export/backup.ts';
import { SYNC_CATEGORIES } from '@modules/firebase/categoryRegistry';

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

        it('lets a v1 import replace stored v2 layouts instead of being shadowed by them', async () => {
            localStorage.setItem('mobileButtonSettings', JSON.stringify({
                version: 2, modes: { solo: {} }, styles: {}, styleOrder: [], radial: { slots: [1] },
            }));

            const importData = JSON.stringify({
                mobileButtonSettings: JSON.stringify({ solo: { buttons: {} }, team: { buttons: {} }, leader: { buttons: {} } }),
            });
            const result = await importCategory('buttons', importData);
            expect(result.success).toBe(true);

            const merged = JSON.parse(localStorage.getItem('mobileButtonSettings')!);
            expect(merged).not.toHaveProperty('version');
            expect(merged).not.toHaveProperty('modes');
            expect(merged).toHaveProperty('solo');
            expect(merged.radial).toEqual({ slots: [1] });
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

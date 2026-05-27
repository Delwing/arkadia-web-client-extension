import {
    migrateSettings,
    runAllSettingsMigrations,
    getLatestMigrationVersion,
    migrateImportedValue,
    migrateMobileButtonMacroData,
} from '@modules/core/settingsMigrations';
import type { Settings } from '@modules/core/defaultSettings';

describe('settingsMigrations', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('migration v1: accusative to nominative enemy names', () => {
        it('converts accusative enemy names to nominative', () => {
            const oldSettings: Partial<Settings> = {
                collectOverrides: [
                    { enemy: 'trolla', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                    { enemy: 'bykocentaura', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                    { enemy: 'ghoula', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                ],
            };

            const { settings, migrated } = migrateSettings(oldSettings);

            expect(migrated).toBe(true);
            expect(settings.collectOverrides).toEqual([
                { enemy: 'troll', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                { enemy: 'bykocentaur', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                { enemy: 'ghoul', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
            ]);
        });

        it('preserves custom enemy names that are not in the migration map', () => {
            const oldSettings: Partial<Settings> = {
                collectOverrides: [
                    { enemy: 'trolla', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                    { enemy: 'custom enemy', collectCopper: true, collectSilver: true, collectGold: true, collectGems: false, collectExtra: ['sword'] },
                ],
            };

            const { settings } = migrateSettings(oldSettings);

            expect(settings.collectOverrides).toEqual([
                { enemy: 'troll', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                { enemy: 'custom enemy', collectCopper: true, collectSilver: true, collectGold: true, collectGems: false, collectExtra: ['sword'] },
            ]);
        });

        it('handles empty collectOverrides', () => {
            const oldSettings: Partial<Settings> = {
                collectOverrides: [],
            };

            const { settings, migrated } = migrateSettings(oldSettings);

            expect(migrated).toBe(true);
            expect(settings.collectOverrides).toEqual([]);
        });

        it('handles missing collectOverrides', () => {
            const oldSettings: Partial<Settings> = {
                collectMode: 1,
            };

            const { settings, migrated } = migrateSettings(oldSettings);

            expect(migrated).toBe(true);
            expect(settings.collectOverrides).toBeUndefined();
            expect(settings.collectMode).toBe(1);
        });
    });

    describe('migration v5: inlineCompassRose boolean to number', () => {
        it('converts true to 1', () => {
            const oldSettings = { inlineCompassRose: true } as any;
            const { settings, migrated } = migrateSettings(oldSettings);
            expect(migrated).toBe(true);
            expect(settings.inlineCompassRose).toBe(1);
        });

        it('converts false to 0', () => {
            const oldSettings = { inlineCompassRose: false } as any;
            const { settings, migrated } = migrateSettings(oldSettings);
            expect(migrated).toBe(true);
            expect(settings.inlineCompassRose).toBe(0);
        });

        it('preserves number values', () => {
            const oldSettings = { inlineCompassRose: 2 } as any;
            const { settings, migrated } = migrateSettings(oldSettings);
            expect(migrated).toBe(true);
            expect(settings.inlineCompassRose).toBe(2);
        });
    });

    describe('migration v9: strip legacy keybinding fields', () => {
        it('removes binds, directions, lamp and main from settings', () => {
            const oldSettings = {
                attackCommand: 'chzabij',
                binds: { main: { key: 'BracketRight' }, lamp: { key: 'Digit4', ctrl: true } },
                directions: { n: { key: 'Numpad8' }, s: { key: 'Numpad2' } },
                lamp: { key: 'Digit4', ctrl: true },
                main: { key: 'BracketRight' },
            } as any;

            const { settings, migrated } = migrateSettings(oldSettings);

            expect(migrated).toBe(true);
            expect(settings).not.toHaveProperty('binds');
            expect(settings).not.toHaveProperty('directions');
            expect(settings).not.toHaveProperty('lamp');
            expect(settings).not.toHaveProperty('main');
            // Real settings are preserved
            expect(settings.attackCommand).toBe('chzabij');
        });

        it('leaves settings without legacy keybinding fields untouched', () => {
            const oldSettings = { attackCommand: 'chzabij', allyGuilds: ['MC', 'OK'] } as any;

            const { settings } = migrateSettings(oldSettings, getLatestMigrationVersion() - 1);

            expect(settings.attackCommand).toBe('chzabij');
            expect(settings.allyGuilds).toEqual(['MC', 'OK']);
        });
    });

    describe('migrateImportedValue (sync / bulk import path)', () => {
        it('runs the full settings registry on an imported settings blob', () => {
            const raw = JSON.stringify({
                attackCommand: 'chzabij',
                inlineCompassRose: true, // v5: boolean -> number
                binds: { main: { key: 'BracketRight' } }, // v9: legacy keybind leftovers
                directions: { n: { key: 'Numpad8' } },
                lamp: { key: 'Digit4', ctrl: true },
                main: { key: 'BracketRight' },
            });

            const migrated = JSON.parse(migrateImportedValue('settings', raw));

            // Applied regardless of stored settingsMigrationsVersion (fromVersion 0)
            expect(migrated.inlineCompassRose).toBe(1);
            expect(migrated).not.toHaveProperty('binds');
            expect(migrated).not.toHaveProperty('directions');
            expect(migrated).not.toHaveProperty('lamp');
            expect(migrated).not.toHaveProperty('main');
            expect(migrated.attackCommand).toBe('chzabij');
        });

        it('migrates even when local already migrated to latest version', () => {
            // The startup pass only runs once and is gated by this version key;
            // imported data must still be migrated even after it is at latest.
            localStorage.setItem('settingsMigrationsVersion', String(getLatestMigrationVersion()));

            const raw = JSON.stringify({ binds: {}, attackCommand: 'x' });
            const migrated = JSON.parse(migrateImportedValue('settings', raw));

            expect(migrated).not.toHaveProperty('binds');
            expect(migrated.attackCommand).toBe('x');
        });

        it('renames macro -> macroType in an imported mobileButtonSettings blob', () => {
            const raw = JSON.stringify({ btnA: { macro: 'kill', label: 'A' } });

            const migrated = JSON.parse(migrateImportedValue('mobileButtonSettings', raw));

            expect(migrated.btnA.macroType).toBe('kill');
            expect(migrated.btnA).not.toHaveProperty('macro');
        });

        it('returns the original string for keys without a migration', () => {
            const raw = JSON.stringify({ anything: true });
            expect(migrateImportedValue('kill_counter', raw)).toBe(raw);
        });

        it('returns the original string when the value is not valid JSON', () => {
            expect(migrateImportedValue('settings', 'not json')).toBe('not json');
        });
    });

    describe('migrateMobileButtonMacroData', () => {
        it('does not mutate its input', () => {
            const input = { btnA: { macro: 'kill' } };
            const { data, changed } = migrateMobileButtonMacroData(input);

            expect(changed).toBe(true);
            expect(data.btnA.macroType).toBe('kill');
            // Original left intact
            expect(input.btnA).toHaveProperty('macro', 'kill');
            expect(input.btnA).not.toHaveProperty('macroType');
        });

        it('reports changed=false when nothing to rename', () => {
            const input = { btnA: { macroType: 'kill' } };
            const { changed } = migrateMobileButtonMacroData(input);
            expect(changed).toBe(false);
        });

        it('handles non-object input without throwing', () => {
            expect(migrateMobileButtonMacroData(null).changed).toBe(false);
            expect(migrateMobileButtonMacroData('x').changed).toBe(false);
        });
    });

    describe('runAllSettingsMigrations', () => {
        it('migrates settings in localStorage', () => {
            const oldSettings = {
                collectOverrides: [
                    { enemy: 'bykocentaura', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                ],
            };
            localStorage.setItem('settings', JSON.stringify(oldSettings));

            runAllSettingsMigrations();

            const migratedRaw = localStorage.getItem('settings');
            const migrated = JSON.parse(migratedRaw!);
            expect(migrated.collectOverrides[0].enemy).toBe('bykocentaur');
        });

        it('migrates character-scoped settings', () => {
            const oldSettings = {
                collectOverrides: [
                    { enemy: 'trolla', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                ],
            };
            localStorage.setItem('Hero:settings', JSON.stringify(oldSettings));

            runAllSettingsMigrations();

            const migratedRaw = localStorage.getItem('Hero:settings');
            const migrated = JSON.parse(migratedRaw!);
            expect(migrated.collectOverrides[0].enemy).toBe('troll');
        });

        it('does not re-migrate if already at latest version', () => {
            localStorage.setItem('settingsMigrationsVersion', String(getLatestMigrationVersion()));
            const settings = {
                collectOverrides: [
                    { enemy: 'trolla', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                ],
            };
            localStorage.setItem('settings', JSON.stringify(settings));

            runAllSettingsMigrations();

            // Should not have migrated since we're already at the latest version
            const raw = localStorage.getItem('settings');
            const parsed = JSON.parse(raw!);
            expect(parsed.collectOverrides[0].enemy).toBe('trolla');
        });

        it('migrates multiple character settings in one pass', () => {
            const globalSettings = {
                collectOverrides: [
                    { enemy: 'trolla', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                ],
            };
            const char1Settings = {
                collectOverrides: [
                    { enemy: 'bykocentaura', collectCopper: true, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                ],
            };
            const char2Settings = {
                collectOverrides: [
                    { enemy: 'ghoula', collectCopper: false, collectSilver: true, collectGold: false, collectGems: true, collectExtra: [] },
                ],
            };
            localStorage.setItem('settings', JSON.stringify(globalSettings));
            localStorage.setItem('Hero:settings', JSON.stringify(char1Settings));
            localStorage.setItem('Wizard:settings', JSON.stringify(char2Settings));

            runAllSettingsMigrations();

            const migratedGlobal = JSON.parse(localStorage.getItem('settings')!);
            const migratedChar1 = JSON.parse(localStorage.getItem('Hero:settings')!);
            const migratedChar2 = JSON.parse(localStorage.getItem('Wizard:settings')!);

            expect(migratedGlobal.collectOverrides[0].enemy).toBe('troll');
            expect(migratedChar1.collectOverrides[0].enemy).toBe('bykocentaur');
            expect(migratedChar2.collectOverrides[0].enemy).toBe('ghoul');
        });
    });
});

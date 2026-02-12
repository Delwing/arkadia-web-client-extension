import { migrateSettings, runAllSettingsMigrations, getLatestMigrationVersion } from '@modules/core/settingsMigrations';
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

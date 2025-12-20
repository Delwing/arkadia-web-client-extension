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
    });
});

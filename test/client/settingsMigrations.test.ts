import {
    migrateSettings,
    runAllSettingsMigrations,
    getLatestMigrationVersion,
    migrateImportedValue,
    migrateMobileButtonMacroData,
    migrateZerknijButtonMacro,
    migrateZerknijButtonMacroData,
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
            // The whole registry runs, so v12 also grants troll/bykocentaur coins and appends potepieniec, v14 wietrzyca, v15 amfisbena.
            expect(settings.collectOverrides).toEqual([
                { enemy: 'troll', collectCopper: false, collectSilver: true, collectGold: true, collectGems: true, collectExtra: [] },
                { enemy: 'bykocentaur', collectCopper: false, collectSilver: true, collectGold: true, collectGems: true, collectExtra: [] },
                { enemy: 'ghoul', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                { enemy: 'potepieniec', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                { enemy: 'wietrzyca', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                { enemy: 'amfisbena', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
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
                { enemy: 'troll', collectCopper: false, collectSilver: true, collectGold: true, collectGems: true, collectExtra: [] },
                { enemy: 'custom enemy', collectCopper: true, collectSilver: true, collectGold: true, collectGems: false, collectExtra: ['sword'] },
                { enemy: 'potepieniec', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                { enemy: 'wietrzyca', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                { enemy: 'amfisbena', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
            ]);
        });

        it('handles empty collectOverrides', () => {
            const oldSettings: Partial<Settings> = {
                collectOverrides: [],
            };

            const { settings, migrated } = migrateSettings(oldSettings);

            expect(migrated).toBe(true);
            // v12, v14 and v15 seed the potepieniec, wietrzyca and amfisbena overrides even when the list starts out empty.
            expect(settings.collectOverrides).toEqual([
                { enemy: 'potepieniec', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                { enemy: 'wietrzyca', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
                { enemy: 'amfisbena', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
            ]);
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

    describe('migration v11: zerknij command buttons become the zerknij macro', () => {
        it('converts a mobile button that sends a literal zerknij', () => {
            const input = {
                solo: {
                    buttons: {
                        'c-button': { macroType: 'command', command: 'zerknij', label: 'zerknij' },
                        'go-button': { macroType: 'command', command: '/go', label: '/go' },
                    },
                },
            };

            const { data, changed } = migrateZerknijButtonMacroData(input);

            expect(changed).toBe(true);
            expect(data.solo.buttons['c-button']).toMatchObject({ macroType: 'zerknij', command: '' });
            expect(data.solo.buttons['go-button']).toMatchObject({ macroType: 'command', command: '/go' });
            // Original left intact
            expect(input.solo.buttons['c-button'].macroType).toBe('command');
        });

        it('reaches hold configs, compound steps and desktop button arrays', () => {
            const input = {
                buttons: [
                    {
                        id: 'b1',
                        macroType: 'compound',
                        command: '',
                        steps: [{ macroType: 'command', command: ' Zerknij ' }],
                        hold: { macroType: 'command', command: 'zerknij' },
                    },
                ],
            };

            const { data, changed } = migrateZerknijButtonMacroData(input);

            expect(changed).toBe(true);
            expect(data.buttons[0].steps[0].macroType).toBe('zerknij');
            expect(data.buttons[0].hold.macroType).toBe('zerknij');
        });

        it('leaves multi-command buttons alone', () => {
            const input = { solo: { buttons: { b: { macroType: 'command', command: 'zerknij\nekwipunek' } } } };
            expect(migrateZerknijButtonMacroData(input).changed).toBe(false);
        });

        it('handles non-object input without throwing', () => {
            expect(migrateZerknijButtonMacroData(null).changed).toBe(false);
            expect(migrateZerknijButtonMacroData('x').changed).toBe(false);
        });

        it('rewrites stored mobile and desktop button settings once', () => {
            localStorage.setItem('mobileButtonSettings', JSON.stringify({
                solo: { buttons: { 'c-button': { macroType: 'command', command: 'zerknij' } } },
            }));
            localStorage.setItem('desktopButtonSettings', JSON.stringify({
                buttons: [{ id: 'b1', macroType: 'command', command: 'zerknij' }],
            }));

            migrateZerknijButtonMacro();

            expect(JSON.parse(localStorage.getItem('mobileButtonSettings')!)
                .solo.buttons['c-button'].macroType).toBe('zerknij');
            expect(JSON.parse(localStorage.getItem('desktopButtonSettings')!)
                .buttons[0].macroType).toBe('zerknij');
        });

        it('is skipped once the migration version is past it', () => {
            localStorage.setItem('settingsMigrationsVersion', String(getLatestMigrationVersion()));
            const stored = JSON.stringify({ solo: { buttons: { b: { macroType: 'command', command: 'zerknij' } } } });
            localStorage.setItem('mobileButtonSettings', stored);

            migrateZerknijButtonMacro();

            expect(localStorage.getItem('mobileButtonSettings')).toBe(stored);
        });

        it('migrates imported button settings', () => {
            const raw = JSON.stringify({ buttons: [{ id: 'b1', macroType: 'command', command: 'zerknij' }] });
            const migrated = JSON.parse(migrateImportedValue('desktopButtonSettings', raw));
            expect(migrated.buttons[0].macroType).toBe('zerknij');
        });
    });

    describe('migration v12: collect override loot tables', () => {
        const gemsOnly = (enemy: string) => ({
            enemy, collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] as string[],
        });

        it('grants silver and gold on the stock troll and bykocentaur overrides', () => {
            const { settings } = migrateSettings({ collectOverrides: [gemsOnly('troll'), gemsOnly('bykocentaur')] });

            expect(settings.collectOverrides?.slice(0, 2)).toEqual([
                { enemy: 'troll', collectCopper: false, collectSilver: true, collectGold: true, collectGems: true, collectExtra: [] },
                { enemy: 'bykocentaur', collectCopper: false, collectSilver: true, collectGold: true, collectGems: true, collectExtra: [] },
            ]);
        });

        it('leaves troll and bykocentaur rows the player already tuned', () => {
            const tuned = { enemy: 'troll', collectCopper: true, collectSilver: false, collectGold: false, collectGems: false, collectExtra: ['maczuga'] };

            const { settings } = migrateSettings({ collectOverrides: [tuned] });

            expect(settings.collectOverrides?.[0]).toEqual(tuned);
        });

        it('appends the potepieniec gems override', () => {
            const { settings } = migrateSettings({ collectOverrides: [gemsOnly('ghoul')] });

            expect(settings.collectOverrides).toContainEqual(gemsOnly('potepieniec'));
        });

        it('keeps an existing potepieniec override untouched', () => {
            const custom = { enemy: 'potepieniec', collectCopper: true, collectSilver: true, collectGold: true, collectGems: true, collectExtra: [] };

            const { settings } = migrateSettings({ collectOverrides: [custom] });

            expect(settings.collectOverrides?.[0]).toEqual(custom);
            expect(settings.collectOverrides?.filter(o => o.enemy === 'potepieniec')).toHaveLength(1);
        });

        it('is idempotent when applied twice', () => {
            const { settings: once } = migrateSettings({ collectOverrides: [gemsOnly('troll')] });
            const { settings: twice } = migrateSettings(once, 0);

            expect(twice.collectOverrides).toEqual(once.collectOverrides);
        });

        it('ignores settings without collectOverrides', () => {
            const { settings } = migrateSettings({ collectMode: 1 });

            expect(settings.collectOverrides).toBeUndefined();
        });
    });

    describe('migration v13: elemental coins', () => {
        const elementals = ['zywiolak ziemi', 'zywiolak wody', 'zywiolak powietrza', 'zywiolak ognia'];
        const gemsOnly = (enemy: string) => ({
            enemy, collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] as string[],
        });

        it('grants silver and gold on all four stock elemental overrides', () => {
            const { settings } = migrateSettings({ collectOverrides: elementals.map(gemsOnly) });

            for (const enemy of elementals) {
                expect(settings.collectOverrides).toContainEqual(
                    { enemy, collectCopper: false, collectSilver: true, collectGold: true, collectGems: true, collectExtra: [] },
                );
            }
        });

        it('leaves elemental rows the player already tuned', () => {
            const tuned = { enemy: 'zywiolak ognia', collectCopper: true, collectSilver: false, collectGold: false, collectGems: false, collectExtra: [] };

            const { settings } = migrateSettings({ collectOverrides: [tuned] });

            expect(settings.collectOverrides?.[0]).toEqual(tuned);
        });
    });

    describe('migration v14: wietrzyca override', () => {
        it('appends the wietrzyca gems override', () => {
            const { settings } = migrateSettings({ collectOverrides: [] }, 13);

            expect(settings.collectOverrides).toContainEqual(
                { enemy: 'wietrzyca', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] }
            );
        });

        it('keeps an existing wietrzyca override untouched', () => {
            const custom = { enemy: 'wietrzyca', collectCopper: true, collectSilver: false, collectGold: false, collectGems: false, collectExtra: [] };

            const { settings, migrated } = migrateSettings({ collectOverrides: [custom] }, 13);

            expect(migrated).toBe(true);
            expect(settings.collectOverrides?.[0]).toEqual(custom);
            expect(settings.collectOverrides?.filter(o => o.enemy === 'wietrzyca')).toHaveLength(1);
        });
    });

    describe('migration v15: amfisbena override', () => {
        it('appends the amfisbena gems override', () => {
            const { settings } = migrateSettings({ collectOverrides: [] }, 14);

            expect(settings.collectOverrides).toEqual([
                { enemy: 'amfisbena', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
            ]);
        });

        it('keeps an existing amfisbena override untouched', () => {
            const custom = { enemy: 'amfisbena', collectCopper: true, collectSilver: true, collectGold: true, collectGems: false, collectExtra: [] };

            const { settings } = migrateSettings({ collectOverrides: [custom] }, 14);

            expect(settings.collectOverrides).toEqual([custom]);
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

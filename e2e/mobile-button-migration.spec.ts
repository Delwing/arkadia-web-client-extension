import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    pushText,
    resetCommandLog,
    waitForCommandInput,
} from './support/mocks';

test.describe('Mobile button settings migration (macro → macroType)', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
    });

    test('migrates old macro field to macroType on app load', async ({ page }) => {
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'command',
                            label: 'Test',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            command: 'ekwipunek',
                        },
                        'button-2': {
                            macro: 'compound',
                            label: 'Combo',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            steps: [
                                { macro: 'command', command: 'ekwipunek' },
                                { macro: 'kierunek', direction: 'n' },
                            ],
                        },
                        'button-3': {
                            macro: 'command',
                            label: 'HoldTest',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            command: 'ekwipunek',
                            holdEnabled: true,
                            hold: {
                                macro: 'command',
                                command: 'spojrz',
                            },
                        },
                    },
                    order: ['button-1', 'button-2', 'button-3'],
                    cols: 3,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                team: {
                    buttons: {},
                    order: [],
                    cols: 4,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                leader: {
                    buttons: {},
                    order: [],
                    cols: 4,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                locked: false,
                radial: { enabled: true, commands: [] },
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);

        const migrated = await page.evaluate(() => {
            const raw = localStorage.getItem('mobileButtonSettings');
            if (!raw) return null;
            return JSON.parse(raw);
        });

        // Simple button migrated
        expect(migrated.solo.buttons['button-1'].macroType).toBe('command');
        expect(migrated.solo.buttons['button-1'].macro).toBeUndefined();

        // Compound button migrated
        expect(migrated.solo.buttons['button-2'].macroType).toBe('compound');
        expect(migrated.solo.buttons['button-2'].macro).toBeUndefined();

        // Compound steps migrated
        expect(migrated.solo.buttons['button-2'].steps[0].macroType).toBe('command');
        expect(migrated.solo.buttons['button-2'].steps[0].macro).toBeUndefined();
        expect(migrated.solo.buttons['button-2'].steps[1].macroType).toBe('kierunek');
        expect(migrated.solo.buttons['button-2'].steps[1].macro).toBeUndefined();

        // Hold config migrated
        expect(migrated.solo.buttons['button-3'].hold.macroType).toBe('command');
        expect(migrated.solo.buttons['button-3'].hold.macro).toBeUndefined();
    });

    test('buttons with old macro format still execute correctly after migration', async ({ page }) => {
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'command',
                            label: 'Zerknij',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            command: 'zerknij',
                        },
                    },
                    order: ['button-1'],
                    cols: 1,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                team: {
                    buttons: {},
                    order: [],
                    cols: 4,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                leader: {
                    buttons: {},
                    order: [],
                    cols: 4,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                locked: true,
                radial: { enabled: true, commands: [] },
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await resetCommandLog(page);

        const btn = page.locator('#button-1');
        await expect(btn).toBeVisible({ timeout: 5000 });
        await btn.click();

        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send command after migration', timeout: 5000 }
        ).toEqual(expect.arrayContaining(['zerknij']));
    });

    test('an old "zerknij" command button becomes the zerknij macro and halts the carriage', async ({ page }) => {
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macroType: 'command',
                            label: 'Zerknij',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            command: 'zerknij',
                        },
                    },
                    order: ['button-1'],
                    cols: 1,
                    background: 'rgba(135, 206, 235, 0.7)',
                },
                team: { buttons: {}, order: [], cols: 4, background: 'rgba(135, 206, 235, 0.7)' },
                leader: { buttons: {}, order: [], cols: 4, background: 'rgba(135, 206, 235, 0.7)' },
                locked: true,
                radial: { enabled: true, commands: [] },
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileButtonSettings')!));
        expect(stored.solo.buttons['button-1'].macroType).toBe('zerknij');

        await pushText(page, 'Siadasz na nieduzym jednokonnym wozie.');
        await pushText(page, 'Nieduzy jednokonny woz rusza na zachod.');
        await resetCommandLog(page);

        const btn = page.locator('#button-1');
        await expect(btn).toBeVisible({ timeout: 5000 });
        await btn.click();

        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'migrated button should halt the carriage', timeout: 5000 }
        ).toEqual(expect.arrayContaining(['zatrzymaj woz']));
    });

    test('three v1 layouts are stored as v2, with only the differences per mode and a backup', async ({ page }) => {
        await page.addInitScript(() => {
            const layout = (label: string) => ({
                buttons: {
                    'button-1': { macroType: 'command', label, color: '#6EB4DC', fontColor: '#f1f5f9', command: 'ekwipunek' },
                },
                order: ['button-1'],
                cols: 1,
                background: 'rgba(135, 206, 235, 0.7)',
            });
            localStorage.setItem('mobileButtonSettings', JSON.stringify({
                solo: layout('Solo'),
                team: layout('Druzyna'),
                leader: layout('Druzyna'),
                locked: true,
                radial: { enabled: true, commands: [] },
            }));
        });

        await page.goto('/');
        await waitForCommandInput(page);

        await expect(page.locator('#button-1')).toHaveText('Solo');

        const stored = await page.evaluate(() => ({
            settings: JSON.parse(localStorage.getItem('mobileButtonSettings')!),
            backup: JSON.parse(localStorage.getItem('mobileButtonSettingsV1Backup')!),
        }));
        expect(stored.settings.version).toBe(2);
        expect(stored.settings.modes.team.buttons['button-1'].label).toBe('Druzyna');
        expect(stored.settings.modes.leader.buttons).toEqual({});
        // The v1 mirror, for clients that haven't updated yet.
        expect(stored.settings.leader.buttons['button-1'].label).toBe('Druzyna');
        expect(stored.backup.team.buttons['button-1'].label).toBe('Druzyna');
    });
});

import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    GMCP_PATHS,
    pushGmcp,
    resetCommandLog,
    waitForCommandInput,
} from './support/mocks';

test.describe('Attack all enemies button macro', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
    });

    test('mobile attackAllEnemies button attacks all rest-category objects', async ({ page }) => {
        // Pre-configure a mobile button with attackAllEnemies macro
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'attackAllEnemies',
                            label: 'Atakuj!',
                            color: '#DC3545',
                            fontColor: '#f1f5f9',
                        },
                    },
                },
                locked: false,
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up character and enemies on location
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Hero', object_num: 100 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Hero', team: true, team_leader: true },
            '101': { desc: 'Goblin', attack_num: 100 },
            '102': { desc: 'Orc', attack_num: 100 },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 101, 102]);

        // Wait for objects to be processed
        await page.waitForTimeout(200);

        await resetCommandLog(page);

        // Click the attack all button
        const mobileButtons = page.locator('#mobile-direction-buttons');
        const attackButton = mobileButtons.locator('#button-1');
        await expect(attackButton).toBeVisible();
        await attackButton.click();

        // Both enemies should be attacked
        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send attack commands for all enemies', timeout: 5000 }
        ).toEqual(expect.arrayContaining([
            expect.stringContaining('ob_101'),
            expect.stringContaining('ob_102'),
        ]));
    });

    test('desktop attackAllEnemies button attacks all rest-category objects', async ({ page }) => {
        // Pre-configure a desktop button with attackAllEnemies macro
        await page.addInitScript(() => {
            const settings = {
                buttons: [
                    {
                        id: 'desktop-btn-1',
                        label: 'Atakuj!',
                        macroType: 'attackAllEnemies',
                        command: '',
                        color: '#DC3545',
                        fontColor: '#f1f5f9',
                        fontSize: 11,
                        width: 80,
                        height: 36,
                        x: 100,
                        y: 100,
                        backgroundOpacity: 0.85,
                    },
                ],
                locked: true,
            };
            localStorage.setItem('desktopButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up character and enemies
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Hero', object_num: 200 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '200': { desc: 'Hero', team: true, team_leader: true },
            '201': { desc: 'Wolf', attack_num: 200 },
            '202': { desc: 'Bear', attack_num: 200 },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [200, 201, 202]);

        await page.waitForTimeout(200);

        await resetCommandLog(page);

        const desktopBtn = page.locator('#desktop-buttons-container .desktop-button').first();
        await expect(desktopBtn).toBeVisible();
        await desktopBtn.click();

        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send attack commands for all enemies', timeout: 5000 }
        ).toEqual(expect.arrayContaining([
            expect.stringContaining('ob_201'),
            expect.stringContaining('ob_202'),
        ]));
    });

    test('attackAllEnemies skips allies', async ({ page }) => {
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'attackAllEnemies',
                            label: 'Atakuj!',
                            color: '#DC3545',
                            fontColor: '#f1f5f9',
                        },
                    },
                },
                locked: false,
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up character, teammate, and enemy
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Hero', object_num: 300 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '300': { desc: 'Hero', team: true, team_leader: true },
            '301': { desc: 'Goblin', attack_num: 300 },
            '302': { desc: 'Ally', team: true },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [300, 301, 302]);

        await page.waitForTimeout(200);

        await resetCommandLog(page);

        const mobileButtons = page.locator('#mobile-direction-buttons');
        const attackButton = mobileButtons.locator('#button-1');
        await attackButton.click();

        // Wait for commands and verify
        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send attack command for enemy but not ally', timeout: 5000 }
        ).toEqual(expect.arrayContaining([
            expect.stringContaining('ob_301'),
        ]));

        // Verify ally was NOT attacked
        const commands = await getCommandLog(page);
        const allyAttacked = commands.some(cmd => cmd.includes('ob_302'));
        expect(allyAttacked, 'should not attack ally').toBe(false);
    });

    test('attackAllEnemies in compound macro', async ({ page }) => {
        // Pre-configure a compound button that includes attackAllEnemies as a step
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'compound',
                            label: 'Rush',
                            color: '#DC3545',
                            fontColor: '#f1f5f9',
                            steps: [
                                { macro: 'command', command: 'przygotuj miecz' },
                                { macro: 'attackAllEnemies' },
                            ],
                        },
                    },
                },
                locked: false,
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up enemies
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Hero', object_num: 400 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '400': { desc: 'Hero', team: true, team_leader: true },
            '401': { desc: 'Spider', attack_num: 400 },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [400, 401]);

        await page.waitForTimeout(200);

        await resetCommandLog(page);

        const mobileButtons = page.locator('#mobile-direction-buttons');
        const button = mobileButtons.locator('#button-1');
        await expect(button).toBeVisible();
        await button.click();

        // Should send the prepare command AND the attack
        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send prepare command and attack all enemies', timeout: 5000 }
        ).toEqual(expect.arrayContaining([
            'przygotuj miecz',
            expect.stringContaining('ob_401'),
        ]));
    });

    test('attackAllEnemies uses configured attack command', async ({ page }) => {
        // Configure custom attack command and the button
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'attackAllEnemies',
                            label: 'Atakuj!',
                            color: '#DC3545',
                            fontColor: '#f1f5f9',
                        },
                    },
                },
                locked: false,
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set character name so we can set character-specific settings
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Warrior', object_num: 500 });

        // Configure custom attack command
        await page.evaluate(() => {
            const key = 'Warrior:settings';
            const existing = localStorage.getItem(key);
            const s = existing ? JSON.parse(existing) : {};
            s.attackCommand = 'masakruj';
            localStorage.setItem(key, JSON.stringify(s));
        });

        // Need to reload for settings to take effect
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Warrior', object_num: 500 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '500': { desc: 'Warrior', team: true, team_leader: true },
            '501': { desc: 'Troll', attack_num: 500 },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [500, 501]);

        await page.waitForTimeout(200);

        await resetCommandLog(page);

        const mobileButtons = page.locator('#mobile-direction-buttons');
        const attackButton = mobileButtons.locator('#button-1');
        await attackButton.click();

        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should use custom attack command', timeout: 5000 }
        ).toEqual(expect.arrayContaining([
            expect.stringMatching(/masakruj.*ob_501/),
        ]));
    });

    test('attackAllEnemies skips bystanders and mops up team targets', async ({ page }) => {
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'attackAllEnemies',
                            label: 'Atakuj!',
                            color: '#DC3545',
                            fontColor: '#f1f5f9',
                        },
                    },
                },
                locked: false,
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Hero', object_num: 600 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            // Hero is already attacking the bandit
            '600': { desc: 'Hero', team: true, team_leader: true, attack_num: 602 },
            // Guard is just standing around - must not be attacked
            '601': { desc: 'Guard' },
            '602': { desc: 'Bandit', attack_num: 600 },
            // Fighting somebody else entirely - not our business
            '603': { desc: 'Stray', attack_num: 601 },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [600, 601, 602, 603]);

        await page.waitForTimeout(200);

        await resetCommandLog(page);

        const mobileButtons = page.locator('#mobile-direction-buttons');
        const attackButton = mobileButtons.locator('#button-1');
        await expect(attackButton).toBeVisible();
        await attackButton.click();

        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should attack the team enemy', timeout: 5000 }
        ).toEqual(expect.arrayContaining([
            expect.stringContaining('ob_602'),
        ]));

        const commands = await getCommandLog(page);
        expect(commands.some(cmd => cmd.includes('ob_601')), 'should not attack bystander').toBe(false);
        expect(commands.some(cmd => cmd.includes('ob_603')), 'should not attack unrelated fighter').toBe(false);
    });
});

import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    GMCP_PATHS,
    pushGmcp,
    waitForCommandInput,
} from './support/mocks';

test.describe('Objects list clicking', () => {
    test('clicking object number attacks the target', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Add objects to the list via GMCP
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 100});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': {desc: 'Hero', team: true, team_leader: true},
            '101': {desc: 'Goblin', attack_num: false, num: 101},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 101]);

        // Wait for object to appear in the list
        const objectNum = page.locator('#objects-list .object-num[data-object-num="1"]');
        await expect(objectNum, 'should display object with shortcut 1').toBeVisible();

        // Click the object number
        await objectNum.click();

        // Verify attack command was sent
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send attack command when clicking object number',
            })
            .toBe('zabij ob_101');
    });

    test('clicking enemy description shields against them', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 100});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': {desc: 'Hero', team: true, team_leader: true},
            '102': {desc: 'Orc Warrior', attack_num: false, num: 102},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 102]);

        // Wait for object description to appear
        const objectDesc = page.locator('#objects-list .object-desc[data-object-num="1"]');
        await expect(objectDesc, 'should display object description').toBeVisible();
        await expect(objectDesc, 'should show enemy name').toContainText('Orc Warrior');

        // Click the object description (note: will trigger /za command which also triggers releaseGuard)
        await objectDesc.click();

        // Verify shield command was sent with shortcut
        await expect
            .poll(async () => {
                const commands = await page.evaluate(() => {
                    const sockets: any[] = (window as any).__mockSockets ?? [];
                    for (let i = sockets.length - 1; i >= 0; i--) {
                        const cmds: unknown = sockets[i]?.commands;
                        if (Array.isArray(cmds)) {
                            return cmds.slice(-2); // Get last 2 commands
                        }
                    }
                    return [];
                });
                return commands;
            }, {
                message: 'should send shield command when clicking enemy description',
            })
            .toContain('zaslon przed ob_102');
    });

    test('clicking teammate description shields them', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 100});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': {desc: 'Hero', team: true, team_leader: true},
            '103': {desc: 'Ally Fighter', team: true, num: 103},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 103]);

        // Wait for teammate to appear
        const teammateDesc = page.locator('#objects-list .object-desc[data-teammate="true"]');
        await expect(teammateDesc, 'should display teammate').toBeVisible();
        await expect(teammateDesc, 'should show teammate name').toContainText('Ally Fighter');

        // Click the teammate description
        await teammateDesc.click();

        // Verify shield command was sent with shortcut
        await expect
            .poll(async () => {
                const commands = await page.evaluate(() => {
                    const sockets: any[] = (window as any).__mockSockets ?? [];
                    for (let i = sockets.length - 1; i >= 0; i--) {
                        const cmds: unknown = sockets[i]?.commands;
                        if (Array.isArray(cmds)) {
                            return cmds.slice(-2); // Get last 2 commands
                        }
                    }
                    return [];
                });
                return commands;
            }, {
                message: 'should send shield command when clicking teammate description',
            })
            .toContain('zaslon ob_103');
    });

    test('clicking multiple objects sends different commands', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 100});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': {desc: 'Hero', team: true, team_leader: true},
            '201': {desc: 'Goblin Scout', attack_num: false, num: 201},
            '202': {desc: 'Orc Berserker', attack_num: false, num: 202},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 201, 202]);

        // Click first object number
        const firstNum = page.locator('#objects-list .object-num[data-object-num="1"]');
        await expect(firstNum, 'should display first object').toBeVisible();
        await firstNum.click();

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should attack first object',
            })
            .toBe('zabij ob_201');

        // Click second object description
        const secondDesc = page.locator('#objects-list .object-desc[data-object-num="2"]');
        await expect(secondDesc, 'should display second object').toBeVisible();
        await secondDesc.click();

        await expect
            .poll(async () => {
                const commands = await page.evaluate(() => {
                    const sockets: any[] = (window as any).__mockSockets ?? [];
                    for (let i = sockets.length - 1; i >= 0; i--) {
                        const cmds: unknown = sockets[i]?.commands;
                        if (Array.isArray(cmds)) {
                            return cmds.slice(-2); // Get last 2 commands
                        }
                    }
                    return [];
                });
                return commands;
            }, {
                message: 'should shield against second object',
            })
            .toContain('zaslon przed ob_202');
    });

    test('player object is not clickable', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 100});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': {desc: 'Hero', team: true, team_leader: true},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100]);

        // Wait for objects list to update
        await page.waitForTimeout(200);

        // Verify no clickable elements for player object
        const playerNum = page.locator('#objects-list .object-num[data-object-id="100"]');
        const playerDesc = page.locator('#objects-list .object-desc[data-object-id="100"]');

        await expect(playerNum, 'player object number should not be clickable').toHaveCount(0);
        await expect(playerDesc, 'player object description should not be clickable').toHaveCount(0);

        // But player name should still be visible in the list
        const objectsList = page.locator('#objects-list .objects-list-content');
        await expect(objectsList, 'should display player name in list').toContainText('Hero');
    });

    test('objects list displays health bars', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 100});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': {desc: 'Hero', team: true, team_leader: true, state: 7},
            '301': {desc: 'Healthy Goblin', attack_num: false, num: 301, state: 6},
            '302': {desc: 'Wounded Troll', attack_num: false, num: 302, state: 3},
            '303': {desc: 'Dying Orc', attack_num: false, num: 303, state: 1},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 301, 302, 303]);

        const objectsList = page.locator('#objects-list .objects-list-content');

        // Verify different health states are displayed
        await expect(objectsList, 'should show healthy enemy').toContainText('Healthy Goblin');
        await expect(objectsList, 'should show wounded enemy').toContainText('Wounded Troll');
        await expect(objectsList, 'should show dying enemy').toContainText('Dying Orc');

        // Verify health bars are rendered (they use # characters)
        // Note: Includes player's health bar, so there are 4 total (1 player + 3 enemies)
        const healthBars = objectsList.locator('span').filter({hasText: /#/});
        await expect(healthBars, 'should display health bars for all objects').toHaveCount(4);
    });
});

import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    GMCP_PATHS,
    primeCharInfo,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';
import type {Page} from '@playwright/test';

async function resetCommands(page: Page): Promise<void> {
    await page.evaluate(() => {
        const globalScope = window as any;
        if (typeof globalScope.__resetCommandLog === 'function') {
            globalScope.__resetCommandLog();
        }
    });
}

async function getAllCommands(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
        return [...((window as any).__mockCommandLog ?? [])];
    });
}

/** Press the Backquote key once to toggle move mode. */
async function pressBackquote(page: Page): Promise<void> {
    await page.keyboard.down('Backquote');
    await page.keyboard.up('Backquote');
    await page.waitForTimeout(50);
}

/** Make the player the team leader by pushing char.info then objects.data with the player object having team_leader: true. */
async function makeTeamLeader(page: Page, playerNum: number): Promise<void> {
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: playerNum});
    await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
        [String(playerNum)]: {
            team: true,
            team_leader: true,
            desc: 'Tester',
            attack_num: false,
        },
    });
    // Allow teamChange event to propagate
    await page.waitForTimeout(100);
}

test.describe('Movement system', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    test.describe('Normal movement', () => {
        test('direction command is sent as-is in normal mode', async ({page}) => {
            await resetCommands(page);
            await submitCommand(page, 'n');
            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'should send plain direction without prefix',
                })
                .toBe('n');
        });

        test('southward direction is sent without prefix', async ({page}) => {
            await resetCommands(page);
            await submitCommand(page, 's');
            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'should send "s" without any prefix',
                })
                .toBe('s');
        });
    });

    test.describe('Move mode toggle via Backquote', () => {
        test('pressing Backquote once then submitting direction sends "przemknij <dir>"', async ({page}) => {
            await page.locator('#message-input').focus();
            await pressBackquote(page);
            await resetCommands(page);

            await submitCommand(page, 'n');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'should prefix direction with "przemknij"',
                })
                .toBe('przemknij n');
        });

        test('output shows move mode notification when toggled', async ({page}) => {
            const output = page.locator('#main_text_output_msg_wrapper');
            await page.locator('#message-input').focus();
            await pressBackquote(page);
            await expect(output, 'should announce mode change to przemknij').toContainText('Tryb ruchu: przemknij');
        });

        test('pressing Backquote twice (without leader) cycles back to normal', async ({page}) => {
            await page.locator('#message-input').focus();
            // Without team leader status, only modes 0 and 1 are available
            // so pressing twice goes 0 -> 1 -> 0
            await pressBackquote(page);
            await pressBackquote(page);

            await resetCommands(page);
            await submitCommand(page, 'e');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'should be back to normal mode after two presses without leader',
                })
                .toBe('e');
        });
    });

    test.describe('Move mode 2 (przemknij z druzyna)', () => {
        test('pressing Backquote twice as team leader then submitting direction sends "przemknij z druzyna <dir>"', async ({page}) => {
            await makeTeamLeader(page, 80010);

            await page.locator('#message-input').focus();
            // First press: mode 1 (przemknij)
            await pressBackquote(page);
            // Second press: mode 2 (przemknij z druzyna) — available because player is leader
            await pressBackquote(page);

            await resetCommands(page);
            await submitCommand(page, 'w');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'should prefix with "przemknij z druzyna" in mode 2',
                })
                .toBe('przemknij z druzyna w');
        });

        test('output shows "przemknij z druzyna" label when toggled to mode 2', async ({page}) => {
            await makeTeamLeader(page, 80011);

            const output = page.locator('#main_text_output_msg_wrapper');
            await page.locator('#message-input').focus();
            await pressBackquote(page);
            await pressBackquote(page);

            await expect(output, 'should show mode 2 label in output').toContainText('Tryb ruchu: przemknij z druzyna');
        });
    });

    test.describe('Move mode cycles back to normal', () => {
        test('mode cycles 0 -> 1 -> 0 without leader', async ({page}) => {
            await page.locator('#message-input').focus();
            // Enter mode 1
            await pressBackquote(page);
            // Return to mode 0
            await pressBackquote(page);
            // Enter mode 1 again to confirm cycling
            await pressBackquote(page);

            await resetCommands(page);
            await submitCommand(page, 's');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'should be in mode 1 again after third press',
                })
                .toBe('przemknij s');
        });

        test('mode cycles 0 -> 1 -> 2 -> 0 as team leader', async ({page}) => {
            await makeTeamLeader(page, 80012);

            await page.locator('#message-input').focus();
            // Cycle: 0 -> 1 -> 2 -> 0
            await pressBackquote(page);
            await pressBackquote(page);
            await pressBackquote(page);

            await resetCommands(page);
            await submitCommand(page, 'n');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'should be back to normal mode (no prefix) after three presses as leader',
                })
                .toBe('n');
        });
    });

    test.describe('Non-direction commands are not prefixed', () => {
        test('non-direction command sent in move mode 1 is not prefixed', async ({page}) => {
            await page.locator('#message-input').focus();
            await pressBackquote(page);

            await resetCommands(page);
            await submitCommand(page, 'obejrzyj');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'non-direction should be sent as-is in move mode 1',
                })
                .toBe('obejrzyj');
        });

        test('arbitrary text command in move mode 1 is not prefixed', async ({page}) => {
            await page.locator('#message-input').focus();
            await pressBackquote(page);

            await resetCommands(page);
            await submitCommand(page, 'ekwipunek');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'inventory command should be sent without prefix',
                })
                .toBe('ekwipunek');
        });
    });

    test.describe('Pre-walk commands', () => {
        test('setting pre-walk with /pre_walk and then moving sends pre-walk command before direction', async ({page}) => {
            await submitCommand(page, '/pre_walk schowaj wszystko');
            // Allow alias to process
            await page.waitForTimeout(100);

            await resetCommands(page);
            await submitCommand(page, 'n');
            // Allow command processing
            await page.waitForTimeout(200);

            const commands = await getAllCommands(page);
            expect(commands.length, 'should have sent at least 2 commands').toBeGreaterThanOrEqual(2);

            const preWalkIdx = commands.indexOf('schowaj wszystko');
            const dirIdx = commands.indexOf('n');

            expect(preWalkIdx, 'should contain pre-walk command').toBeGreaterThanOrEqual(0);
            expect(dirIdx, 'should contain direction command').toBeGreaterThanOrEqual(0);
            expect(preWalkIdx, 'pre-walk command should come before direction').toBeLessThan(dirIdx);
        });

        test('clearing pre-walk with /pre_walk- means direction is sent without pre-walk', async ({page}) => {
            // Set then clear pre-walk
            await submitCommand(page, '/pre_walk schowaj wszystko');
            await page.waitForTimeout(100);
            await submitCommand(page, '/pre_walk-');
            await page.waitForTimeout(100);

            await resetCommands(page);
            await submitCommand(page, 'e');
            await page.waitForTimeout(200);

            const commands = await getAllCommands(page);
            expect(commands, 'should not contain pre-walk command after clearing').not.toContain('schowaj wszystko');
            expect(commands, 'should still send direction').toContain('e');
        });

        test('pre-walk command is NOT sent for non-direction commands', async ({page}) => {
            await submitCommand(page, '/pre_walk schowaj wszystko');
            await page.waitForTimeout(100);

            await resetCommands(page);
            await submitCommand(page, 'obejrzyj');
            await page.waitForTimeout(200);

            const commands = await getAllCommands(page);
            expect(commands, 'pre-walk should not fire for non-direction command').not.toContain('schowaj wszystko');
            expect(commands, 'should send the non-direction command').toContain('obejrzyj');
        });
    });

    test.describe('Post-walk commands', () => {
        test('setting post-walk with /post_walk and then moving sends post-walk command after direction', async ({page}) => {
            await submitCommand(page, '/post_walk rozejrzyj sie');
            await page.waitForTimeout(100);

            await resetCommands(page);
            await submitCommand(page, 's');
            await page.waitForTimeout(200);

            const commands = await getAllCommands(page);
            expect(commands.length, 'should have sent at least 2 commands').toBeGreaterThanOrEqual(2);

            const postWalkIdx = commands.indexOf('rozejrzyj sie');
            const dirIdx = commands.indexOf('s');

            expect(dirIdx, 'should contain direction command').toBeGreaterThanOrEqual(0);
            expect(postWalkIdx, 'should contain post-walk command').toBeGreaterThanOrEqual(0);
            expect(postWalkIdx, 'post-walk command should come after direction').toBeGreaterThan(dirIdx);
        });

        test('clearing post-walk with /post_walk- means direction is sent without post-walk', async ({page}) => {
            await submitCommand(page, '/post_walk rozejrzyj sie');
            await page.waitForTimeout(100);
            await submitCommand(page, '/post_walk-');
            await page.waitForTimeout(100);

            await resetCommands(page);
            await submitCommand(page, 'w');
            await page.waitForTimeout(200);

            const commands = await getAllCommands(page);
            expect(commands, 'should not contain post-walk command after clearing').not.toContain('rozejrzyj sie');
            expect(commands, 'should still send direction').toContain('w');
        });

        test('post-walk command is NOT sent for non-direction commands', async ({page}) => {
            await submitCommand(page, '/post_walk rozejrzyj sie');
            await page.waitForTimeout(100);

            await resetCommands(page);
            await submitCommand(page, 'ekwipunek');
            await page.waitForTimeout(200);

            const commands = await getAllCommands(page);
            expect(commands, 'post-walk should not fire for non-direction command').not.toContain('rozejrzyj sie');
            expect(commands, 'should send the non-direction command').toContain('ekwipunek');
        });

        test('both pre-walk and post-walk fire around direction in correct order', async ({page}) => {
            await submitCommand(page, '/pre_walk przygotuj sie');
            await page.waitForTimeout(100);
            await submitCommand(page, '/post_walk odpoczywaj');
            await page.waitForTimeout(100);

            await resetCommands(page);
            await submitCommand(page, 'n');
            await page.waitForTimeout(200);

            const commands = await getAllCommands(page);
            const preIdx = commands.indexOf('przygotuj sie');
            const dirIdx = commands.indexOf('n');
            const postIdx = commands.indexOf('odpoczywaj');

            expect(preIdx, 'pre-walk should be present').toBeGreaterThanOrEqual(0);
            expect(dirIdx, 'direction should be present').toBeGreaterThanOrEqual(0);
            expect(postIdx, 'post-walk should be present').toBeGreaterThanOrEqual(0);

            expect(preIdx, 'pre-walk comes before direction').toBeLessThan(dirIdx);
            expect(postIdx, 'post-walk comes after direction').toBeGreaterThan(dirIdx);
        });
    });

    test.describe('Carriage mode', () => {
        test('entering carriage changes direction prefix to "jedz na <dir>"', async ({page}) => {
            await pushText(page, 'Siadasz w malej bryczce.');
            // Allow trigger to fire
            await page.waitForTimeout(300);

            await resetCommands(page);
            await submitCommand(page, 'n');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'direction in carriage mode should be prefixed with "jedz na"',
                })
                .toBe('jedz na n');
        });

        test('exiting carriage restores normal direction commands', async ({page}) => {
            await pushText(page, 'Siadasz w malej bryczce.');
            await page.waitForTimeout(300);

            // Verify carriage mode is active
            await resetCommands(page);
            await submitCommand(page, 'n');
            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'should be in carriage mode before exiting',
                })
                .toBe('jedz na n');

            // Exit carriage mode
            await pushText(page, 'Zsiadasz z malej bryczki.');
            await page.waitForTimeout(300);

            await resetCommands(page);
            await submitCommand(page, 'n');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'after dismounting, direction should be plain again',
                })
                .toBe('n');
        });

        test('carriage mode blocks move mode toggle', async ({page}) => {
            await pushText(page, 'Siadasz w malej bryczce.');
            await page.waitForTimeout(300);

            // Attempt to toggle move mode
            await page.locator('#message-input').focus();
            await pressBackquote(page);

            await resetCommands(page);
            await submitCommand(page, 'e');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'Backquote should not switch to przemknij while in carriage mode',
                })
                .toBe('jedz na e');
        });

        test('carriage mode trigger works for different coach sizes', async ({page}) => {
            await pushText(page, 'Siadasz w duzej bryczce.');
            await page.waitForTimeout(300);

            await resetCommands(page);
            await submitCommand(page, 's');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'carriage trigger should match any adjective in "bryczce"',
                })
                .toBe('jedz na s');
        });
    });
});
import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getLastOutgoingCommand,
    GMCP_PATHS,
    primeCharInfo,
    pushGmcp,
    pushText,
    resetCommandLog,
    submitCommand,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';
import type {Page} from '@playwright/test';

/** Press the Backquote key once to toggle move mode. */
async function pressBackquote(page: Page): Promise<void> {
    await page.keyboard.down('Backquote');
    await page.keyboard.up('Backquote');
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
    await page.waitForTimeout(100); // GMCP team data has no visible output to wait for
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
            await resetCommandLog(page);
            await submitCommand(page, 'n');
            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'should send plain direction without prefix',
                })
                .toBe('n');
        });

        test('southward direction is sent without prefix', async ({page}) => {
            await resetCommandLog(page);
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
            await resetCommandLog(page);

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

            await resetCommandLog(page);
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

            await resetCommandLog(page);
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

            await resetCommandLog(page);
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

            await resetCommandLog(page);
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

            await resetCommandLog(page);
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

            await resetCommandLog(page);
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
            await page.waitForTimeout(100); // alias processing — no visible output

            await resetCommandLog(page);
            await submitCommand(page, 'n');

            await expect.poll(async () => {
                const commands = await getCommandLog(page);
                const preWalkIdx = commands.indexOf('schowaj wszystko');
                const dirIdx = commands.indexOf('n');
                return preWalkIdx >= 0 && dirIdx >= 0 && preWalkIdx < dirIdx;
            }, {
                message: 'pre-walk command should come before direction',
                timeout: 3000,
            }).toBe(true);
        });

        test('clearing pre-walk with /pre_walk- means direction is sent without pre-walk', async ({page}) => {
            // Set then clear pre-walk
            await submitCommand(page, '/pre_walk schowaj wszystko');
            await page.waitForTimeout(100); // alias processing — no visible output
            await submitCommand(page, '/pre_walk-');
            await page.waitForTimeout(100); // alias processing — no visible output

            await resetCommandLog(page);
            await submitCommand(page, 'e');

            await expect.poll(async () => {
                const commands = await getCommandLog(page);
                return commands.includes('e') && !commands.includes('schowaj wszystko');
            }, {
                message: 'should send direction without pre-walk after clearing',
                timeout: 3000,
            }).toBe(true);
        });

        test('pre-walk command is NOT sent for non-direction commands', async ({page}) => {
            await submitCommand(page, '/pre_walk schowaj wszystko');
            await page.waitForTimeout(100); // alias processing — no visible output

            await resetCommandLog(page);
            await submitCommand(page, 'obejrzyj');

            await expect.poll(async () => {
                const commands = await getCommandLog(page);
                return commands.includes('obejrzyj') && !commands.includes('schowaj wszystko');
            }, {
                message: 'pre-walk should not fire for non-direction command',
                timeout: 3000,
            }).toBe(true);
        });
    });

    test.describe('Post-walk commands', () => {
        test('setting post-walk with /post_walk and then moving sends post-walk command after direction', async ({page}) => {
            await submitCommand(page, '/post_walk rozejrzyj sie');
            await page.waitForTimeout(100); // alias processing — no visible output

            await resetCommandLog(page);
            await submitCommand(page, 's');

            await expect.poll(async () => {
                const commands = await getCommandLog(page);
                const dirIdx = commands.indexOf('s');
                const postWalkIdx = commands.indexOf('rozejrzyj sie');
                return dirIdx >= 0 && postWalkIdx >= 0 && postWalkIdx > dirIdx;
            }, {
                message: 'post-walk command should come after direction',
                timeout: 3000,
            }).toBe(true);
        });

        test('clearing post-walk with /post_walk- means direction is sent without post-walk', async ({page}) => {
            await submitCommand(page, '/post_walk rozejrzyj sie');
            await page.waitForTimeout(100); // alias processing — no visible output
            await submitCommand(page, '/post_walk-');
            await page.waitForTimeout(100); // alias processing — no visible output

            await resetCommandLog(page);
            await submitCommand(page, 'w');

            await expect.poll(async () => {
                const commands = await getCommandLog(page);
                return commands.includes('w') && !commands.includes('rozejrzyj sie');
            }, {
                message: 'should send direction without post-walk after clearing',
                timeout: 3000,
            }).toBe(true);
        });

        test('post-walk command is NOT sent for non-direction commands', async ({page}) => {
            await submitCommand(page, '/post_walk rozejrzyj sie');
            await page.waitForTimeout(100); // alias processing — no visible output

            await resetCommandLog(page);
            await submitCommand(page, 'ekwipunek');

            await expect.poll(async () => {
                const commands = await getCommandLog(page);
                return commands.includes('ekwipunek') && !commands.includes('rozejrzyj sie');
            }, {
                message: 'post-walk should not fire for non-direction command',
                timeout: 3000,
            }).toBe(true);
        });

        test('both pre-walk and post-walk fire around direction in correct order', async ({page}) => {
            await submitCommand(page, '/pre_walk przygotuj sie');
            await page.waitForTimeout(100); // alias processing — no visible output
            await submitCommand(page, '/post_walk odpoczywaj');
            await page.waitForTimeout(100); // alias processing — no visible output

            await resetCommandLog(page);
            await submitCommand(page, 'n');

            await expect.poll(async () => {
                const commands = await getCommandLog(page);
                const preIdx = commands.indexOf('przygotuj sie');
                const dirIdx = commands.indexOf('n');
                const postIdx = commands.indexOf('odpoczywaj');
                return preIdx >= 0 && dirIdx >= 0 && postIdx >= 0 && preIdx < dirIdx && postIdx > dirIdx;
            }, {
                message: 'pre-walk comes before direction, post-walk comes after',
                timeout: 3000,
            }).toBe(true);
        });
    });

    test.describe('Carriage mode', () => {
        test('entering carriage changes direction prefix to "jedz na <dir>"', async ({page}) => {
            await pushText(page, 'Siadasz w malej bryczce.');
            await waitForOutputContaining(page, 'Siadasz w malej bryczce');

            await resetCommandLog(page);
            await submitCommand(page, 'n');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'direction in carriage mode should be prefixed with "jedz na"',
                })
                .toBe('jedz na n');
        });

        test('exiting carriage restores normal direction commands', async ({page}) => {
            await pushText(page, 'Siadasz w malej bryczce.');
            await waitForOutputContaining(page, 'Siadasz w malej bryczce');

            // Verify carriage mode is active
            await resetCommandLog(page);
            await submitCommand(page, 'n');
            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'should be in carriage mode before exiting',
                })
                .toBe('jedz na n');

            // Exit carriage mode
            await pushText(page, 'Zsiadasz z malej bryczki.');
            await waitForOutputContaining(page, 'Zsiadasz z malej bryczki');

            await resetCommandLog(page);
            await submitCommand(page, 'n');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'after dismounting, direction should be plain again',
                })
                .toBe('n');
        });

        test('carriage mode blocks move mode toggle', async ({page}) => {
            await pushText(page, 'Siadasz w malej bryczce.');
            await waitForOutputContaining(page, 'Siadasz w malej bryczce');

            // Attempt to toggle move mode
            await page.locator('#message-input').focus();
            await pressBackquote(page);

            await resetCommandLog(page);
            await submitCommand(page, 'e');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'Backquote should not switch to przemknij while in carriage mode',
                })
                .toBe('jedz na e');
        });

        test('carriage mode trigger works for different coach sizes', async ({page}) => {
            await pushText(page, 'Siadasz w duzej bryczce.');
            await waitForOutputContaining(page, 'Siadasz w duzej bryczce');

            await resetCommandLog(page);
            await submitCommand(page, 's');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'carriage trigger should match any adjective in "bryczce"',
                })
                .toBe('jedz na s');
        });
    });
});

import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getLastOutgoingCommand,
    GMCP_PATHS,
    primeCharInfo,
    pushGmcp,
    resetCommandLog,
    waitForCommandInput,
} from './support/mocks';
import type {Page} from '@playwright/test';

async function pressKey(
    page: Page,
    code: string,
    modifiers: {ctrl?: boolean; alt?: boolean; shift?: boolean} = {},
): Promise<void> {
    if (modifiers.ctrl) await page.keyboard.down('Control');
    if (modifiers.alt) await page.keyboard.down('Alt');
    if (modifiers.shift) await page.keyboard.down('Shift');

    await page.keyboard.down(code);
    await page.keyboard.up(code);

    if (modifiers.shift) await page.keyboard.up('Shift');
    if (modifiers.alt) await page.keyboard.up('Alt');
    if (modifiers.ctrl) await page.keyboard.up('Control');
}

test.describe('Gate bind (Alt+B)', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    test('sends the default knock in a location without userData.gate', async ({page}) => {
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 4321,
            name: 'Zwykla lokacja',
            exits: {n: 4322},
        });

        await resetCommandLog(page);
        await pressKey(page, 'KeyB', {alt: true});

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'Alt+B should send "uderz we wrota"',
                timeout: 3000,
            })
            .toBe('uderz we wrota');
    });

    test('does not send the knock when pressing plain B (no Alt modifier)', async ({page}) => {
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 4321,
            name: 'Zwykla lokacja',
            exits: {},
        });

        await resetCommandLog(page);

        await page.locator('#message-input').focus();
        await pressKey(page, 'KeyB');
        await page.waitForTimeout(200);

        const commands = await getCommandLog(page);
        expect(commands.filter(c => c === 'uderz we wrota')).toHaveLength(0);
    });
});

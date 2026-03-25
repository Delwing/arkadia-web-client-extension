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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Drinkable bind (Alt+N) and room bind (Alt+P)', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    // -----------------------------------------------------------------------
    // Alt+N – drinkable bind
    // -----------------------------------------------------------------------

    test.describe('Alt+N drinkable bind', () => {
        test('sends "napij sie do syta wody" when a current room is set', async ({page}) => {
            // Push a room so client.Map.currentRoom is not null
            await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
                num: 1234,
                name: 'Testowa lokacja',
                exits: {n: 1235},
            });

            await resetCommandLog(page);
            await pressKey(page, 'KeyN', {alt: true});

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'Alt+N should send "napij sie do syta wody"',
                    timeout: 3000,
                })
                .toBe('napij sie do syta wody');
        });

        test('does not send drink command when pressing plain N (no Alt modifier)', async ({page}) => {
            await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
                num: 1234,
                name: 'Testowa lokacja',
                exits: {n: 1235},
            });

            await resetCommandLog(page);

            // Focus the command input so the N keystroke goes to the input, not a global shortcut
            await page.locator('#message-input').focus();
            await pressKey(page, 'KeyN');
            await page.waitForTimeout(200);

            // Plain N should NOT produce a "napij sie do syta wody" command
            const commands = await getCommandLog(page);
            const drinkCommands = commands.filter(c => c === 'napij sie do syta wody');
            expect(drinkCommands).toHaveLength(0);
        });

        test('sends "napij sie do syta wody" even when room has no drinkable flag', async ({page}) => {
            // The drinkable bind in multibinds.ts is unconditional (no drinkable check on the bind itself)
            await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
                num: 5678,
                name: 'Sucha lokacja',
                exits: {},
            });

            await resetCommandLog(page);
            await pressKey(page, 'KeyN', {alt: true});

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'Alt+N should always send the drink command when a room is set',
                    timeout: 3000,
                })
                .toBe('napij sie do syta wody');
        });
    });

    // -----------------------------------------------------------------------
    // Alt+P – room bind
    // -----------------------------------------------------------------------

    test.describe('Alt+P room bind', () => {
        test('sends nothing when the current room has no userData.bind', async ({page}) => {
            // Push a plain room without any userData.bind
            await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
                num: 9999,
                name: 'Zwykla lokacja',
                exits: {s: 9998},
            });

            await resetCommandLog(page);
            await pressKey(page, 'KeyP', {alt: true});
            await page.waitForTimeout(200);

            const commands = await getCommandLog(page);
            expect(commands).toHaveLength(0);
        });
    });
});

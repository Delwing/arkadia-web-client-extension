import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput, getLastOutgoingCommand} from './support/mocks';

/**
 * Helpers to reset command log and read all outgoing commands.
 */
async function resetCommands(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
        const scope: any = window;
        scope.__resetCommandLog?.();
        for (const socket of (scope.__mockSockets ?? [])) {
            if (Array.isArray(socket?.commands)) {
                socket.commands.length = 0;
            }
        }
    });
}

async function getAllOutgoingCommands(page: import('@playwright/test').Page): Promise<string[]> {
    return await page.evaluate(() => {
        const log: unknown = (window as any).__mockCommandLog;
        if (Array.isArray(log)) {
            return log.filter((v: unknown): v is string => typeof v === 'string' && v.trim() !== '').map((v: string) => v.trim());
        }
        return [];
    });
}

test.describe('Multi-functional Bind Categories', () => {

    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('default category bind fires when key is pressed', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger seat prompt (default category)
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        await resetCommands(page);
        await page.keyboard.press('BracketRight');
        await page.waitForTimeout(50);

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand).toBe('usiadz');
    });

    test('gates category bind fires when triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger gates (gates category)
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        await resetCommands(page);
        await page.keyboard.press('BracketRight');
        await page.waitForTimeout(50);

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand).toBe('uderz we wrota');
    });

    test('transport category bind fires when triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger dylizans transport (transport category)
        await pushText(page, 'Drewniany dylizans powoli zatrzymuje sie obok ciebie.');
        await expect(output).toContainText('bind');

        await resetCommands(page);
        await page.keyboard.press('BracketRight');
        await page.waitForTimeout(50);

        const commands = await getAllOutgoingCommands(page);
        // dylizans bind sends: wem, wsiadz do dylizansu, wlm
        expect(commands).toContain('wem');
        expect(commands).toContain('wsiadz do dylizansu');
        expect(commands).toContain('wlm');
    });

    test('last-set category wins when default and gates share the same key', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // First trigger default (seat)
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Then trigger gates — gates was set more recently, so it should win
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        await resetCommands(page);
        await page.keyboard.press('BracketRight');
        await page.waitForTimeout(50);

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand, 'gates should fire because it was set last').toBe('uderz we wrota');
    });

    test('last-set category wins when gates then default are triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // First trigger gates
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        // Then trigger default (seat) — default was set more recently, so it should win
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        await resetCommands(page);
        await page.keyboard.press('BracketRight');
        await page.waitForTimeout(50);

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand, 'default should fire because it was set last').toBe('usiadz');
    });

    test('last-set category wins when transport and default are triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger default first
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Then trigger transport — transport should win
        await pushText(page, 'Drewniany dylizans powoli zatrzymuje sie obok ciebie.');
        await expect(output).toContainText('bind');

        await resetCommands(page);
        await page.keyboard.press('BracketRight');
        await page.waitForTimeout(50);

        const commands = await getAllOutgoingCommands(page);
        expect(commands, 'transport should fire because it was set last').toContain('wsiadz do dylizansu');
    });

    test('clearing a category lets earlier category surface', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Set default first
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Set gates second — gates wins
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        // Clear gates category via page.evaluate
        await page.evaluate(() => {
            (window as any).client?.FunctionalBind?.clearCategory('gates');
        });

        await resetCommands(page);
        await page.keyboard.press('BracketRight');
        await page.waitForTimeout(50);

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand, 'default should fire after gates is cleared').toBe('usiadz');
    });

    test('each category shows its own label in bind message', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger default (seat) and gates — both should print bind messages
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        // Both bind messages should be visible
        const text = await output.textContent();
        expect(text).toContain('usiadz');
        expect(text).toContain('uderz we wrota');
    });
});

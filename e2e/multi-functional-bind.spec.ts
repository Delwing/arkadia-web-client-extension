import {expect, test} from './support/fixtures';
import {ensureGameSocket, getCommandLog, getLastOutgoingCommand, pushText, resetCommandLog, waitForCommandInput} from './support/mocks';

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

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('usiadz');
    });

    test('gates category bind fires when triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger gates (gates category)
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('uderz we wrota');
    });

    test('transport category bind fires when triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger dylizans transport via standing pattern (room.contents.object GMCP)
        await pushText(page, 'czarny stojacy dylizans', { type: 'room.contents.object' });
        await expect(output).toContainText('bind');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        // wem/wlm are intercepted by bagManager aliases (containerAction),
        // so only the boarding command reaches the socket.
        await expect.poll(() => getCommandLog(page), {timeout: 3000}).toEqual(
            expect.arrayContaining(['wsiadz do dylizansu'])
        );
    });

    test('last-set category wins when default and gates share the same key', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // First trigger default (seat)
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Then trigger gates — gates was set more recently, so it should win
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        await expect.poll(
            () => getLastOutgoingCommand(page), {timeout: 3000}
        ).toBe('uderz we wrota');
    });

    test('last-set category wins when gates then default are triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // First trigger gates
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        // Then trigger default (seat) — default was set more recently, so it should win
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        await expect.poll(
            () => getLastOutgoingCommand(page), {timeout: 3000}
        ).toBe('usiadz');
    });

    test('last-set category wins when transport and default are triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger default first
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Then trigger transport via standing pattern — transport should win
        await pushText(page, 'czarny stojacy dylizans', { type: 'room.contents.object' });
        await expect(output).toContainText('bind');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        await expect.poll(() => getCommandLog(page), {timeout: 3000}).toEqual(
            expect.arrayContaining(['wsiadz do dylizansu'])
        );
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

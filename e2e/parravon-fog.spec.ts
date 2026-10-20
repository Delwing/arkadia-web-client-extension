import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    countSentCommand,
    getLastOutgoingCommand,
    GMCP_PATHS,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';

const FOG = 'Wsrod wszechobecnych oparow tracisz zupelnie orientacje i juz po chwili nie masz pojecia gdzie sie znajdujesz.';
const DIRECTION = /^(?:n|ne|e|se|s|sw|w|nw|u|d)$/;

test.describe('Parravon fog', () => {
    test('bind sends the suggested step and leaves /mgla on the command line for Enter', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');
        const input = page.locator('#message-input');

        await pushText(page, FOG);
        await expect(output).toContainText('Mozliwe lokacje');
        await expect(output).toContainText('bind');
        await expect(input).toHaveValue('/mgla');

        await page.keyboard.press('BracketRight');
        await expect.poll(() => getLastOutgoingCommand(page)).toMatch(DIRECTION);
        await expect(input).toHaveValue('/mgla');

        // No reply in between, so the advice stands: Enter sends the same step again.
        const step = (await getLastOutgoingCommand(page))!;
        await input.press('Enter');
        await expect.poll(() => countSentCommand(page, step)).toBe(2);
        await expect(input).toHaveValue('/mgla');
    });

    test('/mgla start typed by hand fills the line and survives GMCP outside the fog', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const input = page.locator('#message-input');
        await submitCommand(page, '/mgla start');
        await expect(page.locator('#main_text_output_msg_wrapper')).toContainText('Mozliwe lokacje');
        await expect(input).toHaveValue('/mgla');

        // Outside the fog the game keeps sending room info; a manual session stays on.
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {num: 26612, name: 'Ulica', exits: {e: 26613}});
        await page.keyboard.press('BracketRight');
        await expect.poll(() => getLastOutgoingCommand(page)).toMatch(DIRECTION);
        await expect(input).toHaveValue('/mgla');
    });
});

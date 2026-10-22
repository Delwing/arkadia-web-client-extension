import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    primeCharInfo,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

const EVALUATION = [
    'Oceniasz, ze krasnoludzki asymetryczny topor bojowy wazy 5500 gramow, zas jego objetosc wynosi 980 mililitrow.',
    'Wydaje ci sie, ze jest wart okolo 880 miedziakow.',
    '',
    'Zauwazasz, iz topor jest przystosowany do chwytania w dowolnej rece.',
    'Za jego pomoca mozna zadawac rany ciete.',
    'Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na topor jest on bardzo dobrze wywazony i niezwykle skuteczny.',
].join('\n');

async function evaluateAxe(page: import('@playwright/test').Page) {
    await submitCommand(page, 'ocen topor');
    await pushText(page, 'Oceniasz starannie krasnoludzki asymetryczny topor bojowy.');
    await pushText(page, 'Na trzystopowym stylisku osadzone jest asymetryczne ostrze.', {type: 'object.long'});
    await pushText(page, EVALUATION);
}

test.describe('Offering odmien after an evaluation', () => {
    test('offers it to a player who shares, and sends it on click', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);

        const offer = page.locator('#main_text_output_msg_wrapper').getByText('odmien krasnoludzki asymetryczny topor bojowy');

        // Not sharing: nothing offered
        await evaluateAxe(page);
        await expect(page.locator('#main_text_output_msg_wrapper')).toContainText('Suma:');
        // The offer would follow the frame; give it the chance to wrongly appear
        await page.waitForTimeout(300);
        await expect(offer).toHaveCount(0);

        const settings = await openSettings(page, 'ui-other');
        await settings.locator('#ui-crowd-contribute').check();
        await saveSettings(page);

        await evaluateAxe(page);
        await expect(offer).toHaveCount(1);
        await offer.click();
        expect(await getLastOutgoingCommand(page)).toBe('odmien krasnoludzki asymetryczny topor bojowy');
    });
});

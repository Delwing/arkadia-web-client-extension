import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    primeCharInfo,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

test.describe('Armour window', () => {
    test('fills the slots as armour is put on and empties them as it comes off', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);

        await submitCommand(page, '/zbroja');
        const popup = page.locator('.armor-popup');
        await expect(popup).toBeVisible();
        await expect(popup).toContainText('załóż coś');

        // Verbatim from the game
        await pushText(page, [
            'Zakladasz stalowa dluga kolczuge na tulow, nogi i ramiona.',
            'Zakladasz garnczkowy helm z jelenim porozem na glowe.',
            'Zakladasz drewniana okuta tarcze na lewa reke.',
        ].join('\n'));

        const slot = (label: string) => popup.locator('.armor-popup__slot', {hasText: label});
        await expect(slot('Głowa')).toContainText('garnczkowy helm z jelenim porozem');
        for (const label of ['Korpus', 'Prawe ramię', 'Lewe ramię', 'Nogi']) {
            await expect(slot(label)).toContainText('stalowa dluga kolczuge');
        }
        await expect(slot('Tarcza')).toContainText('drewniana okuta tarcze');
        await expect(popup.locator('.armor-popup__part--covered')).toHaveCount(7);
        if (process.env.ARMOR_SCREENSHOT) {
            await popup.screenshot({path: process.env.ARMOR_SCREENSHOT});
        }

        await pushText(page, 'Zdejmujesz z siebie stalowa dluga kolczuge.');
        await expect(slot('Korpus')).toContainText('pusto');
        await expect(slot('Głowa')).toContainText('garnczkowy helm');
        if (process.env.ARMOR_SCREENSHOT) {
            await popup.screenshot({path: process.env.ARMOR_SCREENSHOT.replace(/\.png$/, '-off.png')});
        }
    });
});

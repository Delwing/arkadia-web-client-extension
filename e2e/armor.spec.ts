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
        await expect(popup.locator('.armor-popup__part--covered')).toHaveCount(6);
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

    test('lists what the i reply had that it could not place', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);

        await submitCommand(page, '/zbroja');
        const popup = page.locator('.armor-popup');
        await expect(popup).toBeVisible();

        await submitCommand(page, 'i');
        await pushText(page, [
            'Twoje cialo spowija lsniaca mithrilowa luska.',
            'Na glowie masz garnczkowy helm z jelenim porozem.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'));

        const todo = popup.locator('.armor-popup__todo');
        await expect(todo.locator('.armor-popup__todo-list--unplaced')).toContainText('garnczkowy helm z jelenim porozem');
        await expect(todo.locator('.armor-popup__todo-list--lines')).toContainText('Twoje cialo spowija lsniaca mithrilowa luska.');

        // Put on, the helmet has its slot and leaves the list
        await pushText(page, 'Zakladasz garnczkowy helm z jelenim porozem na glowe.');
        await expect(popup.locator('.armor-popup__slot', {hasText: 'Głowa'})).toContainText('garnczkowy helm');
        await expect(todo.locator('.armor-popup__todo-list--unplaced')).toHaveCount(0);
    });
});

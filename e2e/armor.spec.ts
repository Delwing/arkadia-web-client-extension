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

    test('gives a line i words its own way to the piece it describes', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);

        // Evaluated once, so the złom list knows it and what it covers
        await submitCommand(page, 'ocen luske');
        await pushText(page, 'Oceniasz starannie lsniaca mithrilowa luske.');
        await pushText(page, 'Drobne mithrilowe luski zachodza na siebie jak u ryby.', {type: 'object.long'});
        await pushText(page, [
            'Oceniasz, ze lsniaca mithrilowa luska wazy 6 kilogramow, zas jej objetosc wynosi 4 litrow.',
            'Wydaje ci sie, ze jest warta okolo 900 miedziakow.',
            'Zaklada sie ja na tulow.',
            'Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na lekka zbroje chroni ona dobrze przed obrazeniami cietymi, przyzwoicie przed klutymi i dobrze przed obuchowymi.',
        ].join('\n'));

        await submitCommand(page, '/zbroja');
        const popup = page.locator('.armor-popup');
        await expect(popup).toBeVisible();

        await submitCommand(page, 'i');
        await pushText(page, [
            'Twoje cialo spowija lsniaca mithrilowa luska.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'));

        const line = popup.locator('.armor-popup__todo-list--lines li', {hasText: 'Twoje cialo spowija'});
        await line.click();
        const picker = popup.locator('.armor-iline');
        await expect(picker).toBeVisible();
        await picker.locator('input').first().fill('mithrilowa luska');
        // The piece the line names is offered first
        const first = picker.locator('.armor-iline__candidate').first();
        await expect(first).toContainText('lsniaca mithrilowa luske');
        await first.click();
        await expect(picker.locator('.armor-iline__preview')).toContainText('zajmie: korpus');
        if (process.env.ARMOR_SCREENSHOT) {
            await popup.screenshot({path: process.env.ARMOR_SCREENSHOT.replace(/\.png$/, '-iline.png')});
        }
        await picker.getByRole('button', {name: 'Zapisz'}).click();

        await expect(popup.locator('.armor-popup__slot', {hasText: 'Korpus'})).toContainText('lsniaca mithrilowa luske');
        await expect(popup.locator('.armor-popup__todo-list--lines')).toHaveCount(0);

        // And the next i places it by itself
        await submitCommand(page, 'i');
        await pushText(page, [
            'Twoje cialo spowija lsniaca mithrilowa luska.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'));
        await expect(popup.locator('.armor-popup__slot', {hasText: 'Korpus'})).toContainText('lsniaca mithrilowa luske');
        await expect(popup.locator('.armor-popup__todo')).toHaveCount(0);
    });

    test('ties a piece i names differently to its złom entry', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);

        // Evaluated under one name, so złom knows it and what it covers
        await submitCommand(page, 'ocen helm');
        await pushText(page, 'Oceniasz starannie garnczkowy helm z jelenim porozem.');
        await pushText(page, 'Masywny helm, z ktorego wyrasta jelenie poroze.', {type: 'object.long'});
        await pushText(page, [
            'Oceniasz, ze garnczkowy helm z jelenim porozem wazy 3 kilogramow, zas jego objetosc wynosi 2 litrow.',
            'Wydaje ci sie, ze jest wart okolo 500 miedziakow.',
            'Zaklada sie go na glowe.',
            'Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na ciezka zbroje chroni on dobrze przed obrazeniami cietymi, przyzwoicie przed klutymi i dobrze przed obuchowymi.',
        ].join('\n'));

        await submitCommand(page, '/zbroja');
        const popup = page.locator('.armor-popup');
        await expect(popup).toBeVisible();

        // i words it differently
        await submitCommand(page, 'i');
        await pushText(page, [
            'Na glowie masz garnczkowy helm zdobiony majestatycznym jelenim porozem.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'));

        await popup.getByRole('button', {name: 'garnczkowy helm zdobiony majestatycznym jelenim porozem'}).click();
        const picker = popup.locator('.armor-iline');
        const first = picker.locator('.armor-iline__candidate').first();
        await expect(first).toContainText('garnczkowy helm z jelenim porozem');
        await first.click();
        await expect(picker.locator('.armor-iline__preview')).toContainText('zajmie: głowa');
        await expect(picker).toContainText('Złom zapamięta');
        if (process.env.ARMOR_SCREENSHOT) {
            await popup.screenshot({path: process.env.ARMOR_SCREENSHOT.replace(/\.png$/, '-piece.png')});
        }
        await picker.getByRole('button', {name: 'Zapisz'}).click();

        const head = popup.locator('.armor-popup__slot', {hasText: 'Głowa'});
        await expect(head).toContainText('garnczkowy helm zdobiony majestatycznym jelenim porozem');
        await expect(popup.locator('.armor-popup__todo')).toHaveCount(0);

        // The next i places it by itself
        await submitCommand(page, 'i');
        await pushText(page, [
            'Na glowie masz garnczkowy helm zdobiony majestatycznym jelenim porozem.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'));
        await expect(head).toContainText('garnczkowy helm');
        await expect(popup.locator('.armor-popup__todo')).toHaveCount(0);
    });

    test('offers odmien for a worn piece with no declension, once the player shares', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);

        await submitCommand(page, 'ocen helm');
        await pushText(page, 'Oceniasz starannie garnczkowy helm z jelenim porozem.');
        await pushText(page, 'Masywny helm, z ktorego wyrasta jelenie poroze.', {type: 'object.long'});
        await pushText(page, [
            'Oceniasz, ze garnczkowy helm z jelenim porozem wazy 3 kilogramow, zas jego objetosc wynosi 2 litrow.',
            'Wydaje ci sie, ze jest wart okolo 500 miedziakow.',
            'Zaklada sie go na glowe.',
            'Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na ciezka zbroje chroni on dobrze przed obrazeniami cietymi, przyzwoicie przed klutymi i dobrze przed obuchowymi.',
        ].join('\n'));

        await submitCommand(page, '/zbroja');
        const popup = page.locator('.armor-popup');
        await pushText(page, 'Zakladasz garnczkowy helm z jelenim porozem na glowe.');
        await expect(popup.locator('.armor-popup__slot', {hasText: 'Głowa'})).toContainText('garnczkowy helm');
        // Not sharing: nothing to offer
        await expect(popup.locator('.armor-popup__odmiana')).toHaveCount(0);

        const settings = await openSettings(page, 'ui-other');
        await settings.locator('#ui-crowd-contribute').check();
        await saveSettings(page);
        if (!(await popup.isVisible())) await submitCommand(page, '/zbroja');

        const offer = popup.getByRole('button', {name: 'odmien garnczkowy helm z jelenim porozem'});
        await offer.click();
        expect(await getLastOutgoingCommand(page)).toBe('odmien garnczkowy helm z jelenim porozem');

        await pushText(page, [
            'Garnczkowy helm z jelenim porozem odmienia sie nastepujaco:',
            '',
            '  Mianownik: garnczkowy helm z jelenim porozem,',
            ' Dopelniacz: garnczkowego helmu z jelenim porozem,',
            '   Celownik: garnczkowemu helmowi z jelenim porozem,',
            '    Biernik: garnczkowy helm z jelenim porozem,',
            '  Narzednik: garnczkowym helmem z jelenim porozem,',
            'Miejscownik: garnczkowym helmie z jelenim porozem.',
        ].join('\n'));
        await expect(popup.locator('.armor-popup__odmiana')).toHaveCount(0);
    });
});

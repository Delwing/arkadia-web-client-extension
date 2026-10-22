import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    primeCharInfo,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

/** What other players sent, as the crowd Worker exports it */
const SNAPSHOT = {
    generatedAt: '2026-10-22T20:17:00.000Z',
    bronie: [],
    tarcze: [],
    zbroje: [{
        short: 'lsniaca mithrilowa luska', typ: 'lekka', magik: 0, opis: 'Drobne mithrilowe luski.',
        oslona: 'korpus i ramiona', iLine: 'spowija lsniaca mithrilowa luska', confirmations: 3,
    }],
    odmiany: [{
        mianownik: 'lsniaca mithrilowa luska', dopelniacz: 'lsniacej mithrilowej luski', celownik: 'lsniacej mithrilowej lusce',
        biernik: 'lsniaca mithrilowa luske', narzednik: 'lsniaca mithrilowa luska', miejscownik: 'lsniacej mithrilowej lusce',
        confirmations: 2,
    }],
};

async function shareWithCrowd(page: Page) {
    const settings = await openSettings(page, 'ui-other');
    await settings.locator('#ui-crowd-contribute').check();
    await saveSettings(page);
}

test.describe('Crowd list for a player who shares', () => {
    test.beforeEach(async ({page}) => {
        // Before the fixture's block on the live Worker: a page route wins over a context one
        await page.route(/arkadia-crowd-worker\.[^/]+\/crowd\/snapshot/, route =>
            route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT)}));
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);
    });

    test('places a piece the player never evaluated, by what others taught', async ({page}) => {
        await shareWithCrowd(page);
        await submitCommand(page, '/zbroja');
        const popup = page.locator('.armor-popup');
        await expect(popup).toBeVisible();

        await submitCommand(page, 'i');
        await pushText(page, [
            'Twoje cialo spowija lsniaca mithrilowa luska.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'));

        await expect(popup.locator('.armor-popup__slot', {hasText: 'Korpus'})).toContainText('lsniaca mithrilowa luska');
        // Nothing left to fill in, and no odmien offered: someone already declined it
        await expect(popup.locator('.armor-popup__todo')).toHaveCount(0);
        await expect(popup.locator('.armor-popup__odmiana')).toHaveCount(0);
    });

    test('shows other players\' items in the zlom window, marked, and only when wanted', async ({page}) => {
        await shareWithCrowd(page);
        await submitCommand(page, '/zlomw');
        await page.getByRole('button', {name: /Zbroje \(1\)/}).click();
        const row = page.locator('.zlom-row--crowd', {hasText: 'lsniaca mithrilowa luska'});
        await expect(row).toBeVisible();
        await expect(row.locator('.zlom-tag--crowd')).toHaveText('W');

        await page.getByRole('button', {name: 'Wspólny'}).click();
        await expect(page.locator('.zlom-row--crowd')).toHaveCount(0);
        await expect(page.getByRole('button', {name: /Zbroje \(0\)/})).toBeVisible();
    });

    test('downloads nothing for a player who does not share', async ({page}) => {
        let asked = false;
        page.on('request', request => {
            if (/\/crowd\/snapshot/.test(request.url())) asked = true;
        });
        await submitCommand(page, '/zlomw');
        await expect(page.getByRole('button', {name: /Zbroje \(0\)/})).toBeVisible();
        await expect(page.getByRole('button', {name: 'Wspólny'})).toHaveCount(0);
        expect(asked).toBe(false);
    });
});

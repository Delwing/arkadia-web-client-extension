import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, getCommandLog, GMCP_PATHS, pushGmcp, pushText, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

/**
 * The footer layout (uiSettings.footerLayout): one pick, drawn by every UI.
 * The Arkadia layout puts the exits, the vitals and the chips side by side.
 */

async function pickLayout(page: Page, footerLayout: string): Promise<void> {
    await page.addInitScript((choice) => {
        const raw = localStorage.getItem('uiSettings');
        const settings = raw ? JSON.parse(raw) : {};
        localStorage.setItem('uiSettings', JSON.stringify({...settings, footerLayout: choice}));
    }, footerLayout);
}

async function enterRoom(page: Page): Promise<void> {
    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {id: 1, exits: ['polnoc', 'wschod', 'gora', 'wyjscie']});
}

test.describe('Footer layout', () => {
    test('the Arkadia layout, picked in the settings, lays the exits, vitals and chips out side by side', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await expect(page.locator('.footer-compass')).toHaveCount(0);

        const modal = await openSettings(page, 'ui-footer');
        await modal.locator('#ui-footer-layout').selectOption('arkadia');
        await saveSettings(page);

        await enterRoom(page);
        await pushGmcp(page, 'char.state', {hp: 6, fatigue: 2, stuffed: 3, soaked: 3, mana: 8});

        const status = page.locator('#char-state');
        const compass = status.locator('.footer-compass');
        await expect(compass.locator('[data-dir="n"]')).toBeEnabled();
        await expect(compass.locator('[data-dir="u"]')).toBeEnabled();
        await expect(compass.locator('[data-dir="s"]')).toBeDisabled();
        await expect(compass.locator('.footer-compass__exit')).toHaveText(['wyjscie']);
        await expect(status.locator('.status-vitals--grid .vital').first()).toBeVisible();
        await expect(status.locator('#footer-chips.footer-chip-grid.footer-chips--text')).toBeVisible();

        // The three columns sit side by side, the compass first.
        const left = async (selector: string) => status.locator(selector).evaluate((el) => el.getBoundingClientRect().left);
        expect(await left('.footer-compass')).toBeLessThan(await left('.status-vitals'));
        expect(await left('.status-vitals')).toBeLessThan(await left('#footer-chips'));

        await compass.locator('[data-dir="n"]').click();
        await compass.locator('.footer-compass__exit').click();
        await expect.poll(() => getCommandLog(page)).toEqual(expect.arrayContaining(['n', 'wyjscie']));
    });

    test('each layout offers its own adjustments, and they reshape the footer', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await enterRoom(page);

        const modal = await openSettings(page, 'ui-footer');
        await modal.locator('#ui-footer-layout').selectOption('stock');
        await expect(modal.locator('#ui-footer-chip-arrange')).toBeVisible();
        await expect(modal.locator('#ui-footer-chip-rows')).toHaveCount(0);

        await modal.locator('#ui-footer-layout').selectOption('arkadia');
        await expect(modal.locator('#ui-footer-chip-arrange')).toHaveCount(0);
        await modal.locator('#ui-footer-chip-rows').fill('2');
        await modal.locator('#ui-footer-chip-look').selectOption('icon');
        await modal.locator('#ui-footer-compass').uncheck();
        await expect(modal.locator('#ui-footer-compass-width')).toHaveCount(0);
        await saveSettings(page);

        const grid = page.locator('#char-state #footer-chips.footer-chip-grid');
        await expect(grid).toBeVisible();
        await expect(grid).not.toHaveClass(/footer-chips--text/);
        expect(await grid.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--chip-rows'))).toBe('2');
        await expect(page.locator('.footer-compass')).toHaveCount(0);

        // Lampa and Fajka share the first column: one width, whatever their text.
        const width = (id: string) => grid.locator(`#${id} .chip`).evaluate((el) => el.getBoundingClientRect().width);
        const lamp = await width('lamp-timer');
        expect(lamp).toBeGreaterThan(0);
        expect(await width('pipe-status')).toBeCloseTo(lamp, 0);
    });

    test('the classic line in the text look keeps every chip on one line while they fit', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');

        const modal = await openSettings(page, 'ui-footer');
        await modal.locator('#ui-footer-layout').selectOption('stock');
        await modal.locator('#ui-footer-chip-look').selectOption('text');
        await saveSettings(page);

        const chips = page.locator('#footer-chips.footer-chips--text');
        await expect(chips.locator('#clock-display')).toContainText('06:00');
        await expect(chips.locator('#lamp-timer')).toBeVisible();
        // A new reading redraws the clock, which has the line measured again.
        await pushText(page, 'Jest w przyblizeniu siodma rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');
        await expect(chips.locator('#clock-display')).toContainText('07:00');
        await expect(page.locator('#char-state .status-more')).toHaveCount(0);
        // The clock leads with its value, so its label takes no colon, and stays one line high.
        const clockLabel = chips.locator('#clock-display .chip__lab');
        expect(await clockLabel.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
        expect(await chips.locator('#clock-display .chip').evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(24);
    });

    test('the forge layout in the stock UI: binds row, spaced chips, vitals over a Postępy bar', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await pickLayout(page, 'forge');
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, 'char.state', {hp: 6, fatigue: 2, improve: 5});

        // The binds band is the bind row itself, not part of the status line.
        await expect(page.locator('#multi-binds')).toContainText('Brak akcji');
        await expect(page.locator('#char-state #multi-binds')).toHaveCount(0);

        const chips = page.locator('#char-state #footer-chips.footer-strip');
        await expect(chips).toBeVisible();
        expect(await chips.evaluate((el) => getComputedStyle(el).columnGap)).toBe('6px');

        // Postępy leaves the vitals for a bar of its own under them.
        const vitals = page.locator('.footer-band .footer-vitals');
        await expect(vitals.locator('.improve-bar .improve-seg.on')).toHaveCount(5);
        await expect(vitals.locator('.vital[data-vital="improve"]')).toHaveCount(0);
        await expect(vitals.locator('.vital[data-vital="hp"]')).toBeVisible();
        expect(await vitals.locator('.status-vitals').evaluate((el) => getComputedStyle(el).borderRightWidth)).toBe('0px');
    });

    test('a phone keeps the stock footer whatever the pick', async ({page}) => {
        await page.setViewportSize({width: 390, height: 800});
        await pickLayout(page, 'arkadia');
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await enterRoom(page);

        await expect(page.locator('#footer-chips.status-chips')).toBeAttached();
        await expect(page.locator('.footer-compass')).toHaveCount(0);
    });

    test('forge draws the same pick on its plate', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await pickLayout(page, 'arkadia');
        await page.goto('/forge-ui/');
        await page.locator('.gate__close').click();

        const plate = page.locator('.hud-panel');
        await expect(plate.locator('.footer-compass')).toBeVisible();
        await expect(plate.locator('.footer-chip-grid.footer-chips--text')).toBeAttached();
    });
});

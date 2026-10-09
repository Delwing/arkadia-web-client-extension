import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, getCommandLog, GMCP_PATHS, pushGmcp, waitForCommandInput} from './support/mocks';

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
    test('the Arkadia layout lays the exits, vitals and chips out side by side', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await pickLayout(page, 'arkadia');
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
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

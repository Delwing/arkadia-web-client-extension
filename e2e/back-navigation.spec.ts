import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';
import { ensureGameSocket, waitForCommandInput } from './support/mocks';
import { SETTINGS_BUTTON, SETTINGS_MODAL } from './support/settings';

/**
 * A phone's Back closes what is open on top (src/ui/web/backNavigation.ts)
 * instead of leaving the page.
 */

const menuPanel = '.command-menu__panel';

const settingsPage = (page: Page, category: string) =>
    page.locator(`${SETTINGS_MODAL} .settings-page[data-settings-category="${category}"]`);

async function back(page: Page) {
    await page.evaluate(() => history.back());
}

async function expectStillOnPage(page: Page) {
    await expect(page.locator('#message-input')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
}

test.describe('Back on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('closes the main menu', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);

        await page.click('#menu-button');
        await expect(page.locator(menuPanel)).toBeVisible();

        await back(page);
        await expect(page.locator(menuPanel)).toHaveCount(0);
        await expectStillOnPage(page);
    });

    test('steps out of settings one level at a time', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);

        await page.click('#menu-button');
        await page.click(SETTINGS_BUTTON);
        const modal = page.locator(SETTINGS_MODAL);
        await expect(modal).toBeVisible();
        await modal.locator('.settings-phone__row[data-settings-category="ui-map"]').click();
        await expect(settingsPage(page, 'ui-map')).toBeVisible();

        await back(page);
        await expect(settingsPage(page, 'ui-map'), 'Back goes from a page to the list').toBeHidden();
        await expect(modal.locator('.settings-phone__row[data-settings-category="ui-map"]')).toBeVisible();
        await expect(modal).toBeVisible();

        await back(page);
        await expect(modal, 'then closes the window').toBeHidden();
        await expectStillOnPage(page);
    });

    test('a window closed with its × leaves no Back behind', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);

        await page.click('#menu-button');
        await page.click(SETTINGS_BUTTON);
        const modal = page.locator(SETTINGS_MODAL);
        await expect(modal).toBeVisible();
        await modal.locator('[data-modal-dismiss]:visible').first().click();
        await expect(modal).toBeHidden();

        // Every entry the layers pushed has been walked back over: the page sits
        // on the one it started on, so the next Back is the browser's own.
        await expect.poll(() => page.evaluate(() => (history.state as Record<string, unknown> | null)?.__arkadiaBackLayer ?? 0)).toBe(0);
    });

    test('closes a window opened from the menu, then the menu is not in the way', async ({ page }) => {
        await page.goto('/');
        await ensureGameSocket(page);
        await waitForCommandInput(page);

        await page.click('#menu-button');
        await page.locator(`${menuPanel} #docs-button`).click();
        await expect(page.locator('.docs-window')).toBeVisible();
        await expect(page.locator(menuPanel), 'picking an entry closes the menu').toHaveCount(0);

        // The menu's entry went with it: one Back closes the window.
        await back(page);
        await expect(page.locator('.docs-window')).toHaveCount(0);
        await expectStillOnPage(page);
    });
});

test.describe('Back on a desktop', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('is left to the browser', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        const start = await page.evaluate(() => history.length);

        await page.click('#menu-button');
        await expect(page.locator(menuPanel)).toBeVisible();
        expect(await page.evaluate(() => history.length), 'opening a menu adds no history entry').toBe(start);
    });
});

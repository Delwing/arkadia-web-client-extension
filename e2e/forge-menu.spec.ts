import { test, expect } from './support/fixtures';

/**
 * The forge-ui command-rail menu: the "⋮" button in the rail opens a dropdown
 * mirroring the stock menu, and its items open forged modals (editors/docs) or
 * dockable popups.
 */
test.describe('forge menu', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/forge-ui/');
        // The rail (and its menu button) render without a game connection.
        await expect(page.locator('.forge-menu__button')).toBeVisible();
    });

    test('opens the dropdown with the expected items', async ({ page }) => {
        await page.locator('.forge-menu__button').click();
        const list = page.locator('.forge-menu__list');
        await expect(list).toBeVisible();
        await expect(list.getByRole('button', { name: 'Triggery' })).toBeVisible();
        await expect(list.getByRole('button', { name: 'Skrypty' })).toBeVisible();
        await expect(list.getByRole('button', { name: 'Dokumentacja' })).toBeVisible();
        await expect(list.getByRole('button', { name: 'Ustawienia' })).toBeVisible();
    });

    test('opens the triggers editor in a forged modal', async ({ page }) => {
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Triggery' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('.panel__title')).toHaveText('Triggery');
        // Backdrop click dismisses it.
        await page.locator('.forge-menu-backdrop').click({ position: { x: 5, y: 5 } });
        await expect(modal).toHaveCount(0);
    });

    test('opens the documentation with content', async ({ page }) => {
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Dokumentacja' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('.panel__title')).toHaveText('Dokumentacja');
        await expect(modal.locator('.docs-content')).not.toBeEmpty();
    });
});

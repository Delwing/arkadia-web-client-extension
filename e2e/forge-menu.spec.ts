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

    test('ui settings tabs isolate their panels', async ({ page }) => {
        // Regression: the tabbed settings panels hide inactive tabs with the
        // Bootstrap `.d-none` utility, which only existed in the (conditionally
        // loaded) stock global CSS — so opened cold, every tab's content used
        // to stack at once. forge's scoped Bootstrap subset now defines it.
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Interfejs' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();
        // Ogólne is the default tab: its content shows, the Mapa tab's is hidden.
        const general = modal.getByRole('heading', { name: 'Menedżer Okien' });
        const mapMarker = modal.getByRole('heading', { name: 'Marker gracza' });
        await expect(general).toBeVisible();
        await expect(mapMarker).toBeHidden();
        // Switching tabs swaps which panel is visible.
        await modal.getByRole('button', { name: 'Mapa', exact: true }).click();
        await expect(mapMarker).toBeVisible();
        await expect(general).toBeHidden();
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

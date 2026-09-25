import { test, expect } from './support/fixtures';
import { waitForCommandInput } from './support/mocks';
import { openSettings, SETTINGS_MODAL } from './support/settings';
import type { Page } from '@playwright/test';

/**
 * The main page hosts both shells: the classic stock chrome and the forge HUD.
 * The choice is per device and switching reloads the page; `?ui=` picks a shell
 * for one load without storing it. Each shell also lets the player choose which
 * docks span the screen, independently of the other shell.
 */

async function openStock(page: Page, url = '/'): Promise<void> {
    await page.goto(url);
    await waitForCommandInput(page);
    // Disconnected, the login screen covers the page; dismiss it.
    await page.locator('#auth-close').click();
}

async function dismissForgeGate(page: Page): Promise<void> {
    // Disconnected, the login gate covers the HUD; dismiss it to reach the rail.
    await page.locator('.gate__close').click();
    await expect(page.locator('.forge-menu__button')).toBeVisible();
}

async function openForgeWindowsSettings(page: Page) {
    await page.locator('.forge-menu__button').click();
    await page.locator('.forge-menu__list').getByRole('button', { name: 'Interfejs' }).click();
    const modal = page.locator('.forge-menu-modal');
    await modal.locator('.settings-dialog__nav-item[data-settings-category="ui-windows"]').click();
    await expect(modal.getByRole('heading', { name: 'Menedżer Okien' })).toBeVisible();
    return modal;
}

test.describe('UI shell switch', () => {
    test('switches the main page to forge and back', async ({ page }) => {
        await openStock(page);

        const modal = await openSettings(page, 'ui-windows');
        await modal.locator('#ui-shell-forge').click();

        // The same page now boots the forge HUD instead of the stock chrome.
        await dismissForgeGate(page);
        await expect(page.locator('#message-input')).toHaveCount(0);
        await expect(page.locator('#alt-input')).toBeVisible();

        // The choice sticks across reloads.
        await page.reload();
        await dismissForgeGate(page);

        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Klasyczny wygląd' }).click();

        await waitForCommandInput(page);
        await expect(page.locator('.forge-menu__button')).toHaveCount(0);
        await page.reload();
        await waitForCommandInput(page);
    });

    test('the stock menu opens forge', async ({ page }) => {
        await openStock(page);

        await page.click('#menu-button');
        await page.click('#shell-button');

        await dismissForgeGate(page);
    });

    test('?ui=forge boots forge for one load without storing it', async ({ page }) => {
        await page.goto('/?ui=forge');
        await dismissForgeGate(page);

        await page.goto('/');
        await waitForCommandInput(page);
    });
});

test.describe('Dock arrangement', () => {
    test('stock lets the side docks span the full height', async ({ page }) => {
        await page.setViewportSize({ width: 1400, height: 850 });
        await openStock(page);

        const modal = await openSettings(page, 'ui-windows');
        const toggle = modal.locator('#ui-layout-manager-enabled');
        if (!(await toggle.isChecked())) await toggle.click();
        const arrangement = modal.locator('#ui-layout-dock-arrangement');
        await expect(arrangement).toHaveValue('topBottom');
        await arrangement.selectOption('leftRight');
        await modal.locator('.app-modal__close').click();
        await expect(page.locator(SETTINGS_MODAL)).not.toBeVisible();

        await expect(page.locator('body')).toHaveClass(/layout-rails-vertical/);
        // The right rail (map + object list) runs past the command line to the bottom.
        const rail = await page.locator('.dock-zone--right').boundingBox();
        const input = await page.locator('#input-area').boundingBox();
        expect(rail && input).toBeTruthy();
        expect(rail!.y + rail!.height).toBeGreaterThanOrEqual(input!.y + input!.height - 1);
        expect(input!.x + input!.width).toBeLessThanOrEqual(rail!.x + 1);

        // Kept across reloads.
        await openStock(page);
        await expect(page.locator('body')).toHaveClass(/layout-rails-vertical/);

        // Back to top/bottom priority.
        const again = await openSettings(page, 'ui-windows');
        await again.locator('#ui-layout-dock-arrangement').selectOption('topBottom');
        await expect(page.locator('body')).not.toHaveClass(/layout-rails-vertical/);
    });

    test('forge keeps its own arrangement, apart from stock', async ({ page }) => {
        await page.goto('/?ui=forge');
        await dismissForgeGate(page);
        // Forge defaults to the side rails.
        await expect(page.locator('body')).toHaveClass(/layout-rails-vertical/);

        const modal = await openForgeWindowsSettings(page);
        const arrangement = modal.locator('#ui-layout-dock-arrangement');
        await expect(arrangement).toHaveValue('leftRight');
        await arrangement.selectOption('topBottom');
        await expect(page.locator('body')).not.toHaveClass(/layout-rails-vertical/);

        await page.reload();
        await dismissForgeGate(page);
        await expect(page.locator('body')).not.toHaveClass(/layout-rails-vertical/);

        // The stock shell still has its own default.
        await openStock(page);
        const stock = await openSettings(page, 'ui-windows');
        await expect(stock.locator('#ui-layout-dock-arrangement')).toHaveValue('topBottom');
    });
});

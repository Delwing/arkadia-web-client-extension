import { test, expect } from './support/fixtures';
import { waitForCommandInput } from './support/mocks';
import type { Page } from '@playwright/test';

/**
 * forge-ui needs layout mode on, the objectList slot enabled and the rail-span
 * arrangement — but it shares the persisted `layoutManagerState` key with the
 * stock UI. Those three fields are therefore process-local overrides
 * (`setLayoutOverrides` in forge-ui/main.tsx), never writes: merely opening
 * forge must not flip the stock UI's "Menedzer Okien" on, nor overwrite the
 * choice of a user who already made one.
 */

async function openForge(page: Page): Promise<void> {
    await page.goto('/forge-ui/');
    // Disconnected, the login gate covers the HUD; dismiss it to reach the rail.
    await page.locator('.gate__close').click();
    await expect(page.locator('.forge-menu__button')).toBeVisible();
    // forge itself runs in layout mode.
    await expect(page.locator('body')).toHaveClass(/layout-manager-enabled/);
    // Let the debounced layout save (300ms) land before reading storage.
    await page.waitForTimeout(600);
}

function readLayoutState(page: Page) {
    return page.evaluate(() => {
        const raw = localStorage.getItem('layoutManagerState');
        return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    });
}

test.describe('forge/stock layout isolation', () => {
    test('opening forge leaves the stock layout manager off', async ({ page }) => {
        await openForge(page);

        const persisted = await readLayoutState(page);
        expect(persisted?.enabled ?? false).toBe(false);

        await page.goto('/');
        await waitForCommandInput(page);
        await expect(page.locator('body')).not.toHaveClass(/layout-manager-enabled/);
    });

    test('opening forge preserves the stock layout choice a user already made', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await page.evaluate(() => {
            localStorage.setItem('layoutManagerState', JSON.stringify({
                enabled: true,
                spanningDocks: 'topBottom',
                uiLocked: false,
                enabledPanels: { objectList: false },
                windows: {},
                dockTrees: { top: null, bottom: null, left: null, right: null },
                dockExtents: {},
                popupPanels: {},
                builtInPanels: {},
            }));
        });

        await openForge(page);

        const persisted = await readLayoutState(page);
        // Forge's own requirements stayed out of the shared key.
        expect(persisted?.enabled).toBe(true);
        expect(persisted?.spanningDocks).toBe('topBottom');
        expect((persisted?.enabledPanels as { objectList?: boolean })?.objectList).toBe(false);
    });

    test('forge hides the layout-manager toggles it forces on', async ({ page }) => {
        await openForge(page);

        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Interfejs' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal.getByRole('heading', { name: 'Menedżer Okien' })).toBeVisible();
        // The checkboxes would be inert here (overrides don't persist), so the
        // section only offers the layout reset.
        await expect(modal.locator('#ui-layout-manager-enabled')).toHaveCount(0);
        await expect(modal.locator('#ui-layout-manager-object-list')).toHaveCount(0);
        await expect(modal.locator('#ui-layout-manager-reset')).toBeVisible();
    });
});

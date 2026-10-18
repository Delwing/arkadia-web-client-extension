import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

test.describe('Kuźnia theme', () => {
    test('picked in the settings, it forges the windows: iron plate, bronze Cinzel titles', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openSettings(page, 'ui-windows');
        await modal.locator('#ui-layout-manager-enabled').check();
        await saveSettings(page);
        const window = page.locator('.managed-panel').first();
        const title = window.locator('.managed-panel__title').first();
        await expect(title).toBeVisible();
        await expect(title).not.toHaveCSS('font-family', /Cinzel/);

        await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-color-theme').selectOption('forged');
        await saveSettings(page);

        await expect(page.locator('body')).toHaveClass(/\btheme-forged\b/);
        await expect(title).toHaveCSS('font-family', /Cinzel/);
        await expect(title).toHaveCSS('color', 'rgb(184, 150, 90)');
        await expect(window).toHaveCSS('border-radius', '9px');
    });
});

import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';
import type {Page} from '@playwright/test';

// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function boot(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
}

/** What the page shows behind everything: the backdrop drawn under <body>. */
const backdrop = (page: Page) =>
    expect.poll(() => page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage));

const output = (page: Page) => page.locator('#main_text_output_msg_wrapper');

test.describe('Page backdrop', () => {
    test('Kuźnia lays its stone behind the page and the output shows it; another theme keeps the plain colour', async ({page}) => {
        await boot(page);
        await backdrop(page).toBe('none');
        await expect(output(page)).toHaveCSS('background-color', 'rgb(36, 36, 36)');

        const modal = await openSettings(page, 'ui-appearance');
        await expect(modal.locator('#ui-backdrop')).toHaveValue('theme');
        await modal.locator('#ui-color-theme').selectOption('forged');
        await saveSettings(page);
        await backdrop(page).toMatch(/stone.*\.jpg/);
        await expect(output(page)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

        await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-backdrop').selectOption('none');
        await saveSettings(page);
        await backdrop(page).toBe('none');
        await expect(output(page)).toHaveCSS('background-color', 'rgb(36, 36, 36)');
    });

    test('an uploaded image goes behind the page, shaded, and is gone once removed', async ({page}) => {
        await boot(page);
        const modal = await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-backdrop').selectOption('uploaded');
        await modal.locator('#ui-backdrop-input').setInputFiles({name: 'las.png', mimeType: 'image/png', buffer: PNG});
        await expect(modal.locator('#ui-backdrop-name')).toHaveText('las.png');
        await modal.locator('#ui-backdrop-shade').fill('30');
        await saveSettings(page);
        await backdrop(page).toMatch(/rgba\(0, 0, 0, 0\.3\).*url\("blob:/);

        // Kept on this device across a reload.
        await boot(page);
        await backdrop(page).toMatch(/url\("blob:/);

        await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-backdrop-clear').click();
        await expect(modal.locator('#ui-backdrop-name')).toHaveCount(0);
        await saveSettings(page);
        await backdrop(page).toBe('none');
    });
});

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

const output = (page: Page) => page.locator('#main_text_output_msg_wrapper');

test.describe('Output background image', () => {
    test('Kuźnia lays its stone under the output; another theme keeps the plain colour', async ({page}) => {
        await boot(page);
        await expect(output(page)).toHaveCSS('background-image', 'none');

        const modal = await openSettings(page, 'ui-appearance');
        await expect(modal.locator('#ui-output-image')).toHaveValue('theme');
        await modal.locator('#ui-color-theme').selectOption('forged');
        await saveSettings(page);
        await expect(output(page)).toHaveCSS('background-image', /stone.*\.jpg/);

        await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-output-image').selectOption('none');
        await saveSettings(page);
        await expect(output(page)).toHaveCSS('background-image', 'none');
    });

    test('an uploaded image goes under the output, shaded, and is gone once removed', async ({page}) => {
        await boot(page);
        const modal = await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-output-image').selectOption('uploaded');
        await modal.locator('#ui-output-image-input').setInputFiles({name: 'las.png', mimeType: 'image/png', buffer: PNG});
        await expect(modal.locator('#ui-output-image-name')).toHaveText('las.png');
        await modal.locator('#ui-output-image-shade').fill('30');
        await saveSettings(page);
        await expect(output(page)).toHaveCSS('background-image', /rgba\(0, 0, 0, 0\.3\).*url\("blob:/);

        // Kept on this device across a reload.
        await boot(page);
        await expect(output(page)).toHaveCSS('background-image', /url\("blob:/);

        await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-output-image-clear').click();
        await expect(modal.locator('#ui-output-image-name')).toHaveCount(0);
        await saveSettings(page);
        await expect(output(page)).toHaveCSS('background-image', 'none');
    });
});

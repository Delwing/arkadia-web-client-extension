import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    resetCommandLog,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';

/**
 * api.multibinds.addTemporary puts a plugin's command on the multibind bar
 * (in memory only) and runs it on the multibind key; remove() takes it off.
 * The plugin exposes both through aliases so the test drives it like a user.
 */

const MENU_BUTTON = '#menu-button';
const SCRIPTS_BUTTON = '#scripts-button';
const SCRIPTS_MODAL = '#scripts-modal';
const PLUGIN_URL = 'https://example.com/temporary-multibinds-plugin.js';
const PLUGIN_NAME = 'Temp Multibinds Test';

const PLUGIN_SOURCE = `
let handle = null;
export async function init(api) {
    api.aliases.register(/^\\/tmb-add$/, () => {
        handle = api.multibinds.addTemporary({ action: 'otworz skrzynie', label: 'Skrzynia', highlight: true });
    });
    api.aliases.register(/^\\/tmb-rm$/, () => {
        handle?.remove();
    });
    return { name: '${PLUGIN_NAME}', version: '1.0.0' };
}
export async function destroy() {}
`;

async function loadPlugin(page: Page): Promise<void> {
    await page.route(`${PLUGIN_URL}**`, async (route) => {
        await route.fulfill({status: 200, contentType: 'application/javascript', body: PLUGIN_SOURCE});
    });

    await page.click(MENU_BUTTON);
    await page.click(SCRIPTS_BUTTON);
    const modal = page.locator(SCRIPTS_MODAL);
    await expect(modal, 'should show scripts modal').toBeVisible();

    await modal.getByRole('button', {name: 'Dodaj plugin'}).click();
    await page.locator('.plugin-route', {hasText: 'Z adresu URL'}).click();

    const dialog = page.locator('.popup-dialog', {hasText: 'Dodaj skrypt z URL'}).last();
    await dialog.getByPlaceholder('URL skryptu').fill(PLUGIN_URL);
    await dialog.getByRole('button', {name: 'Dodaj', exact: true}).click();
    await expect(modal.getByText(PLUGIN_NAME), 'plugin should load and show its name').toBeVisible();

    await modal.locator('.app-modal__close').first().click();
    await expect(modal).not.toBeVisible();
}

test.describe('Plugin temporary multibinds', () => {
    test('appear on the bar, run on their key and disappear on remove', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await loadPlugin(page);

        const multiBinds = page.locator('#multi-binds');
        await expect(multiBinds, 'bar should start empty').not.toHaveClass(/active/);

        await submitCommand(page, '/tmb-add');

        const pill = multiBinds.locator('.multi-bind');
        await expect(pill, 'temporary bind should be on the bar').toHaveCount(1);
        await expect(pill, 'should show the plugin label').toContainText('Skrzynia');
        await expect(pill, 'should be marked temporary').toHaveClass(/multi-bind--temporary/);
        await expect(pill, 'should be highlighted').toHaveClass(/multi-bind--highlight/);

        await resetCommandLog(page);
        await page.keyboard.down('Alt');
        await page.keyboard.press('Digit1');
        await page.keyboard.up('Alt');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'Alt+1 should send the temporary bind action',
                timeout: 5000,
            })
            .toBe('otworz skrzynie');

        await submitCommand(page, '/tmb-rm');
        await expect(pill, 'temporary bind should be gone').toHaveCount(0);
        await expect(multiBinds, 'bar should be inactive again').not.toHaveClass(/active/);
    });
});

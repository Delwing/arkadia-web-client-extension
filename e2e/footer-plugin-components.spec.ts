import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, installEmbeddedMock, waitForCommandInput} from './support/mocks';

/**
 * A plugin's footer component used to be invisible to Interfejs -> Stopka: it
 * was always shown, ordered by the position it asked for, and absent from the
 * list the user reorders and switches. This walks the whole seam - plugin API,
 * common registry, settings panel, footer - for the widened behaviour.
 */

const MENU_BUTTON = '#menu-button';
const SCRIPTS_BUTTON = '#scripts-button';
const SCRIPTS_MODAL = '#scripts-modal';
const UI_SETTINGS_BUTTON = '#ui-settings-button';
const UI_MODAL = '#ui-settings-modal';
const PLUGIN_URL = 'https://example.com/footer-chip-plugin.js';
const PLUGIN_NAME = 'Chip Test';
const CHIP_TEXT = 'CHIP-OK';

const PLUGIN_SOURCE = `
export async function init(api) {
    const handle = api.ui.registerFooterComponent('chip', '<span>${CHIP_TEXT}</span>', 'end');
    globalThis.__footerChipHandle = handle;
    return { name: '${PLUGIN_NAME}', version: '1.0.0' };
}
export async function destroy() {
    globalThis.__footerChipHandle?.remove();
}
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

    const dialog = page.locator('.modal', {hasText: 'Dodaj skrypt z URL'}).last();
    await dialog.getByPlaceholder('URL skryptu').fill(PLUGIN_URL);
    await dialog.getByRole('button', {name: 'Dodaj', exact: true}).click();
    await expect(modal.getByText(PLUGIN_NAME), 'plugin should load and show its name').toBeVisible();

    await modal.locator('.btn-close').first().click();
    await expect(modal).not.toBeVisible();
}

async function openFooterSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.waitForFunction(() => {
        const el = document.getElementById('ui-settings-modal');
        return !el || window.getComputedStyle(el).display === 'none';
    });
    await page.click(UI_SETTINGS_BUTTON);
    const modal = page.locator(UI_MODAL);
    await expect(modal, 'should open UI settings modal').toBeVisible();
    await page.waitForFunction(() => {
        const d = document.querySelector('#ui-settings-modal .modal-dialog') as HTMLElement | null;
        if (!d) return false;
        const t = window.getComputedStyle(d).transform;
        return t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
    });
    await modal.getByRole('button', {name: 'Stopka', exact: true}).click();
    await modal.locator('#ui-footer-components-settings').waitFor({state: 'visible'});
    return modal;
}

/** The plugin's own span, wherever the footer put it. */
const chip = (page: Page) => page.locator('.plugin-footer-component', {hasText: CHIP_TEXT});

test.beforeEach(async ({context}) => {
    await installEmbeddedMock(context);
});

test.describe('plugin footer components in the footer settings', () => {
    test('are listed by plugin name, and can be switched off and back on', async ({page}) => {
        await page.goto('/');
        await ensureGameSocket(page);
        await waitForCommandInput(page);

        await loadPlugin(page);
        await expect(chip(page), 'plugin chip should be in the footer').toBeVisible();

        const modal = await openFooterSettings(page);
        const list = modal.locator('#ui-footer-components-settings');

        // Listed under the plugin's name rather than its `plugin:<id>:chip` id,
        // which is the whole reason the registry carries a label.
        const row = list.locator('.d-flex.align-items-center', {hasText: PLUGIN_NAME});
        await expect(row, 'plugin should have a row in the footer settings').toHaveCount(1);
        await expect(row.locator('.badge'), 'plugin rows are marked as such').toHaveText('plugin');

        // Switching it off has to reach the footer, not just the config.
        const toggle = row.locator('.form-check-input');
        await expect(toggle, 'plugin chip starts visible').toBeChecked();
        await toggle.uncheck();
        await modal.locator('#ui-settings-save').click();
        await expect(modal).not.toBeVisible();
        await expect(chip(page), 'switching it off should hide the chip').toHaveCount(0);

        // And back on again.
        const modalAgain = await openFooterSettings(page);
        const rowAgain = modalAgain
            .locator('#ui-footer-components-settings')
            .locator('.d-flex.align-items-center', {hasText: PLUGIN_NAME});
        await expect(rowAgain, 'a hidden plugin is still offered in the list').toHaveCount(1);
        await rowAgain.locator('.form-check-input').check();
        await modalAgain.locator('#ui-settings-save').click();
        await expect(modalAgain).not.toBeVisible();
        await expect(chip(page), 'switching it back on should restore the chip').toBeVisible();
    });
});

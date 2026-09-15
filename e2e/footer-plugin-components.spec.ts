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

/** The flex item the plugin component is laid out as, and the last stock chip. */
const PLUGIN_ITEM = '#char-state .footer-plugin-item';
const LAST_CHIP = '#connection-status';

/**
 * Where the footer actually puts something. #char-state is a flex row, so a
 * position is the computed `order` of a flex item - the stock chips are elements
 * in that row, and the plugin component sits in a `display: contents` slot so
 * that it is one too.
 */
async function footerOrder(page: Page, selector: string): Promise<number> {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`no footer element for ${sel}`);
        return Number(window.getComputedStyle(el).order);
    }, selector);
}

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

    test('can be reordered past a built-in chip', async ({page}) => {
        await page.goto('/');
        await ensureGameSocket(page);
        await waitForCommandInput(page);

        await loadPlugin(page);
        await expect(chip(page), 'plugin chip should be in the footer').toBeVisible();

        // Registered as 'end', so it starts behind every built-in chip.
        expect(await footerOrder(page, PLUGIN_ITEM), 'an unmoved "end" component sits last')
            .toBeGreaterThan(await footerOrder(page, LAST_CHIP));

        const modal = await openFooterSettings(page);
        const rows = modal.locator('#ui-footer-components-settings').locator('.d-flex.align-items-center');
        const row = rows.filter({hasText: PLUGIN_NAME});
        const lastBuiltIn = await rows.count() - 2;

        // Move the plugin's row one place up, over the last built-in chip. The
        // keyboard sensor lifts on Space and moves on the arrows; each step only
        // reaches the drop once React has rendered it, so wait for what the step
        // does - the lifted row is dimmed, and moving it shifts it up the list.
        await row.locator('[role="button"]').first().focus();
        await page.keyboard.press('Space');
        await expect(row, 'Space should lift the row').toHaveCSS('opacity', '0.5');
        await page.keyboard.press('ArrowUp');
        await expect
            .poll(() => row.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42),
                {message: 'ArrowUp should shift the lifted row upwards'})
            .toBeLessThan(0);
        await page.keyboard.press('Space');
        await expect(rows.nth(lastBuiltIn), 'dropping it should reorder the list')
            .toContainText(PLUGIN_NAME);

        await modal.locator('#ui-settings-save').click();
        await expect(modal).not.toBeVisible();

        expect(await footerOrder(page, PLUGIN_ITEM), 'moving it up should move it in the footer')
            .toBeLessThan(await footerOrder(page, LAST_CHIP));
        await expect(chip(page), 'and it should still be shown').toBeVisible();
    });
});

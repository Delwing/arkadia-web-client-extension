import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, installEmbeddedMock, waitForCommandInput} from './support/mocks';
import {openSettings, SETTINGS_SAVE} from './support/settings';

/**
 * A plugin's footer component used to be invisible to Interfejs -> Stopka: it
 * was always shown, ordered by the position it asked for, and absent from the
 * list the user reorders and switches. This walks the whole seam - plugin API,
 * common registry, settings panel, footer - for the widened behaviour.
 */

const MENU_BUTTON = '#menu-button';
const SCRIPTS_BUTTON = '#scripts-button';
const SCRIPTS_MODAL = '#scripts-modal';
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

    const dialog = page.locator('.popup-dialog', {hasText: 'Dodaj skrypt z URL'}).last();
    await dialog.getByPlaceholder('URL skryptu').fill(PLUGIN_URL);
    await dialog.getByRole('button', {name: 'Dodaj', exact: true}).click();
    await expect(modal.getByText(PLUGIN_NAME), 'plugin should load and show its name').toBeVisible();

    await modal.locator('.app-modal__close').first().click();
    await expect(modal).not.toBeVisible();
}

async function openFooterSettings(page: Page) {
    const modal = await openSettings(page, 'ui-footer');
    await modal.locator('#ui-footer-components-settings').waitFor({state: 'visible'});
    return modal;
}

/** The plugin's own span, wherever the footer put it. */
const chip = (page: Page) => page.locator('.plugin-footer-component', {hasText: CHIP_TEXT});

/** The chip slot the plugin component is laid out in, and the last shown stock chip
 *  (the connection chip after it is hidden out of the box, so it has no slot). */
const PLUGIN_ITEM = '#char-state .footer-plugin-item';
const LAST_CHIP = '#break-item-warning';

/**
 * Where the footer actually puts something: the computed flex `order` of an item's
 * slot in the status line's chip row.
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
        const row = list.locator('.settings-sort-item', {hasText: PLUGIN_NAME});
        await expect(row, 'plugin should have a row in the footer settings').toHaveCount(1);
        await expect(row.locator('.settings-sort-item__badge'), 'plugin rows are marked as such').toHaveText('plugin');

        // Switching it off has to reach the footer, not just the config.
        const toggle = row.locator('input[type=checkbox]');
        await expect(toggle, 'plugin chip starts visible').toBeChecked();
        await toggle.uncheck();
        await modal.locator(SETTINGS_SAVE).click();
        await expect(modal).not.toBeVisible();
        await expect(chip(page), 'switching it off should hide the chip').toHaveCount(0);

        // And back on again.
        const modalAgain = await openFooterSettings(page);
        const rowAgain = modalAgain
            .locator('#ui-footer-components-settings')
            .locator('.settings-sort-item', {hasText: PLUGIN_NAME});
        await expect(rowAgain, 'a hidden plugin is still offered in the list').toHaveCount(1);
        await rowAgain.locator('input[type=checkbox]').check();
        await modalAgain.locator(SETTINGS_SAVE).click();
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
        const before = await footerOrder(page, PLUGIN_ITEM);
        expect(before, 'an unmoved "end" component sits last')
            .toBeGreaterThan(await footerOrder(page, LAST_CHIP));

        const modal = await openFooterSettings(page);
        const rows = modal.locator('#ui-footer-components-settings').locator('.settings-sort-item');
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

        await modal.locator(SETTINGS_SAVE).click();
        await expect(modal).not.toBeVisible();

        // One place up puts it before the (hidden) connection chip, still after the rest.
        expect(await footerOrder(page, PLUGIN_ITEM), 'moving it up should move it in the footer')
            .toBeLessThan(before);
        expect(await footerOrder(page, PLUGIN_ITEM), 'and keep it behind the shown chips')
            .toBeGreaterThan(await footerOrder(page, LAST_CHIP));
        await expect(chip(page), 'and it should still be shown').toBeVisible();
    });
});

test.describe('plugin footer components in the status line', () => {
    // Plugin components (an animated companion, a smoking pipe) are drawn to spill
    // out of their tile, up over the bind row even - nothing around them may clip.
    test('are not clipped by the status line', async ({page}) => {
        await page.goto('/');
        await ensureGameSocket(page);
        await waitForCommandInput(page);

        await loadPlugin(page);
        await expect(chip(page), 'plugin chip should be in the footer').toBeVisible();

        const clipping = await chip(page).evaluate((el) => {
            const found: string[] = [];
            for (let node = el.parentElement; node; node = node.parentElement) {
                const style = getComputedStyle(node);
                if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
                    found.push(`${node.tagName}.${node.className}`);
                }
                if (node.id === 'char-state') break;
            }
            return found;
        });
        expect(clipping, 'no ancestor up to and including the status line clips it').toEqual([]);
    });

    test('spill out of the tile and draw over the bind row', async ({page}) => {
        await page.goto('/');
        await ensureGameSocket(page);
        await waitForCommandInput(page);

        await loadPlugin(page);
        await expect(chip(page), 'plugin chip should be in the footer').toBeVisible();

        // Stand in for the animated companion: something the plugin draws well above
        // its own tile. The bind row is faked active - what matters here is the CSS.
        const report = await page.evaluate(() => {
            const bar = document.getElementById('multi-binds')!;
            bar.classList.add('active');
            const pill = document.createElement('button');
            pill.className = 'multi-bind';
            pill.textContent = 'bind';
            bar.appendChild(pill);

            const host = document.querySelector('.plugin-footer-component') as HTMLElement;
            host.style.position = 'relative';
            const spill = document.createElement('i');
            spill.id = 'spill-probe';
            spill.style.cssText = 'position:absolute;left:0;bottom:100%;display:block;width:24px;height:64px';
            host.appendChild(spill);

            const probe = spill.getBoundingClientRect();
            const row = bar.getBoundingClientRect();
            const hit = document.elementFromPoint(probe.left + probe.width / 2, probe.top + 4);
            return {spillTop: probe.top, spillHeight: probe.height, barBottom: row.bottom, hitId: hit?.id ?? null};
        });

        expect(report.spillHeight, 'the spill keeps its full height, uncropped').toBe(64);
        expect(report.spillTop, 'and reaches up past the bind row').toBeLessThan(report.barBottom);
        expect(report.hitId, 'drawn over the bind row, not behind it').toBe('spill-probe');
    });
});

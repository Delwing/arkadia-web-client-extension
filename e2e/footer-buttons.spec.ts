import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    installEmbeddedMock,
    resetCommandLog,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

/**
 * The buttons a player keeps next to the command line (Ustawienia -> Stopka):
 * one click sends their command, a button standing for a mode lights up while
 * that mode is on, and what does not fit goes behind its own "...".
 */

const PLUGIN_URL = 'https://example.com/footer-button-plugin.js';
const PLUGIN_SOURCE = `
export async function init(api) {
    api.ui.registerFooterButton('towarzysz', {
        label: 'Towarzysz',
        command: 'towarzysz',
        tone: 'accent',
        state: 'towarzysz',
    });
    globalThis.__setTowarzysz = (on) => api.ui.setFooterButtonState('towarzysz', on);
    return { name: 'Button Test', version: '1.0.0' };
}
`;

/** Seed buttons the way the settings editor stores them. */
async function seedButtons(page: Page, buttons: Array<Record<string, unknown>>): Promise<void> {
    await page.addInitScript((list) => {
        const raw = localStorage.getItem('uiSettings');
        const settings = raw ? JSON.parse(raw) : {};
        settings.footerButtons = list;
        localStorage.setItem('uiSettings', JSON.stringify(settings));
    }, buttons);
}

test.beforeEach(async ({context}) => {
    await installEmbeddedMock(context);
});

test.describe('Footer buttons', () => {
    test('a configured button sends its command', async ({page}) => {
        await seedButtons(page, [
            {id: 'a', label: 'kondycja', command: 'kondycja', tone: 'neutral', order: 0},
            {id: 'b', label: 'zabij cel', command: 'zabij cel', tone: 'danger', order: 1},
        ]);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const row = page.locator('#footer-buttons');
        await expect(row).toBeVisible();
        await expect(row.locator('.footer-button[data-footer-button]')).toHaveCount(2);
        await expect(row.locator('[data-footer-button="b"]'), 'the tone is on the button')
            .toHaveClass(/footer-button--danger/);

        await resetCommandLog(page);
        await row.locator('[data-footer-button="a"]').click();
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('kondycja');
    });

    test('a button with a state lights up while that state is on', async ({page}) => {
        await seedButtons(page, [
            {id: 'm', label: 'Tryb: podroz', command: 'tryb podroz', tone: 'accent', state: 'podroz', order: 0},
        ]);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const button = page.locator('[data-footer-button="m"]');
        await expect(button).not.toHaveClass(/is-on/);

        // A trigger or a script turns the state on with /przycisk.
        await submitCommand(page, '/przycisk podroz on');
        await expect(button).toHaveClass(/is-on/);
        await expect(button.locator('.footer-button__dot')).toBeVisible();

        await submitCommand(page, '/przycisk podroz off');
        await expect(button).not.toHaveClass(/is-on/);

        // Without on/off it toggles.
        await submitCommand(page, '/przycisk podroz');
        await expect(button).toHaveClass(/is-on/);
    });

    test('no buttons configured leaves the command bar as it was', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await expect(page.locator('#footer-buttons')).toHaveCount(0);
    });

    test('buttons are added and edited in Ustawienia -> Stopka', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openSettings(page, 'ui-footer');
        const editor = modal.locator('#ui-footer-buttons-settings');
        await expect(editor).toBeVisible();

        await modal.locator('#ui-footer-button-add').click();
        const row = editor.locator('.footer-button-settings__row').first();
        await row.locator('.footer-button-settings__label').fill('kondycja');
        await row.locator('.footer-button-settings__command').fill('kondycja');
        await saveSettings(page);

        const button = page.locator('#footer-buttons .footer-button[data-footer-button]');
        await expect(button).toHaveCount(1);
        await expect(button).toHaveText('kondycja');

        await resetCommandLog(page);
        await button.click();
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('kondycja');
    });

    test('what does not fit goes behind its own "..."', async ({page}) => {
        await seedButtons(page, Array.from({length: 10}, (_, i) => ({
            id: `b${i}`,
            label: `komenda numer ${i}`,
            command: `komenda${i}`,
            tone: 'neutral',
            order: i,
        })));
        await page.setViewportSize({width: 1024, height: 800});
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const more = page.locator('#footer-buttons-more');
        await expect(more, 'ten buttons cannot fit beside the command line').toBeVisible();
        const shown = page.locator('#footer-buttons .footer-button[data-footer-button]:not(.is-overflow)');
        await expect.poll(async () => await shown.count()).toBeGreaterThan(0);
        await expect.poll(async () => await shown.count()).toBeLessThan(10);

        // The command line keeps its one-line height.
        const rowHeight = await page.locator('#footer-buttons').evaluate(el => el.getBoundingClientRect().height);
        expect(rowHeight).toBeLessThanOrEqual(30);

        await more.click();
        const hidden = page.locator('[data-footer-button-overflow]').first();
        await expect(hidden).toBeVisible();
        await resetCommandLog(page);
        await hidden.click();
        await expect.poll(() => getLastOutgoingCommand(page)).toMatch(/^komenda\d$/);
    });

    test('on a phone the folded footer has no buttons and the sheet lays them out as a grid', async ({page}) => {
        await seedButtons(page, [
            {id: 'a', label: 'kondycja', command: 'kondycja', tone: 'neutral', order: 0},
        ]);
        await page.setViewportSize({width: 420, height: 860});
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await expect(page.locator('#footer-buttons'), 'the folded line stays status only').toBeHidden();
        await expect(page.locator('#footer-buttons-sheet')).toBeHidden();

        await page.locator('#footer-expand').click();
        const sheet = page.locator('#footer-buttons-sheet');
        await expect(sheet).toBeVisible();
        await expect(sheet).toHaveCSS('grid-template-columns', /(\S+ ){2}\S+/);

        await resetCommandLog(page);
        await sheet.locator('[data-footer-button-sheet="a"]').click();
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('kondycja');
    });

    test('a plugin can add a button and light it up', async ({page}) => {
        await page.route(`${PLUGIN_URL}**`, async (route) => {
            await route.fulfill({status: 200, contentType: 'application/javascript', body: PLUGIN_SOURCE});
        });
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await page.click('#menu-button');
        await page.click('#scripts-button');
        const modal = page.locator('#scripts-modal');
        await modal.getByRole('button', {name: 'Dodaj plugin'}).click();
        await page.locator('.plugin-route', {hasText: 'Z adresu URL'}).click();
        const dialog = page.locator('.modal', {hasText: 'Dodaj skrypt z URL'}).last();
        await dialog.getByPlaceholder('URL skryptu').fill(PLUGIN_URL);
        await dialog.getByRole('button', {name: 'Dodaj', exact: true}).click();
        await expect(modal.getByText('Button Test')).toBeVisible();
        await modal.locator('.btn-close').first().click();
        await expect(modal).not.toBeVisible();

        const button = page.locator('#footer-buttons .footer-button[data-footer-button]', {hasText: 'Towarzysz'});
        await expect(button).toBeVisible();
        await expect(button, "a plugin's button is dashed").toHaveClass(/footer-button--plugin/);

        await page.evaluate(() => (globalThis as any).__setTowarzysz(true));
        await expect(button).toHaveClass(/is-on/);

        await resetCommandLog(page);
        await button.click();
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('towarzysz');
    });
});

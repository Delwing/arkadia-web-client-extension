import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, submitCommand, waitForCommandInput} from './support/mocks';

/**
 * Plugins give their popups a starting size: px, any CSS length, or 'content'
 * (fit to the content), always kept on screen. The plugin opens each popup
 * from an alias so the test drives it like a user.
 */

const MENU_BUTTON = '#menu-button';
const SCRIPTS_BUTTON = '#scripts-button';
const SCRIPTS_MODAL = '#scripts-modal';
const PLUGIN_URL = 'https://example.com/popup-size-plugin.js';
const PLUGIN_NAME = 'Popup Size Test';
const MARGIN = 16;

const PLUGIN_SOURCE = `
function box(width, height) {
    const el = document.createElement('div');
    el.style.width = width;
    el.style.height = height;
    el.textContent = 'x';
    return el;
}
export async function init(api) {
    const fixed = await api.ui.registerPersistentPopup({
        id: 'fixed', title: 'Staly', createContent: () => box('10px', '10px'),
        initialWidth: 420, initialHeight: '50vh',
    });
    const fitted = await api.ui.registerPersistentPopup({
        id: 'fitted', title: 'Dopasowany', createContent: () => box('520px', '200px'),
        initialWidth: 'content', initialHeight: 'content',
    });
    const huge = await api.ui.registerPersistentPopup({
        id: 'huge', title: 'Wielki', createContent: () => box('5000px', '5000px'),
        initialWidth: 'content', initialHeight: 'content',
    });
    api.aliases.register(/^\\/pps-fixed$/, () => { fixed.open(); });
    api.aliases.register(/^\\/pps-fitted$/, () => { fitted.open(); });
    api.aliases.register(/^\\/pps-huge$/, () => { huge.open(); });
    api.aliases.register(/^\\/pps-legacy$/, () => {
        api.ui.createPopup('Stary', box('10px', '10px'), { initialWidth: '25vw', initialHeight: 180 });
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

async function openPopup(page: Page, command: string, title: string) {
    await submitCommand(page, command);
    const panel = page.locator('.floating-panel', {has: page.locator('.floating-panel__header', {hasText: title})});
    await expect(panel, `${title} popup should open`).toBeVisible();
    return panel;
}

test.describe('Plugin popup starting size', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await loadPlugin(page);
    });

    test('uses px and CSS lengths', async ({page}) => {
        const viewport = page.viewportSize()!;

        const fixed = await openPopup(page, '/pps-fixed', 'Staly');
        const fixedBox = (await fixed.boundingBox())!;
        expect(fixedBox.width).toBeCloseTo(420, 0);
        expect(fixedBox.height).toBeCloseTo(Math.round(viewport.height / 2), 0);

        const legacy = await openPopup(page, '/pps-legacy', 'Stary');
        const legacyBox = (await legacy.boundingBox())!;
        expect(legacyBox.width).toBeCloseTo(Math.max(300, Math.round(viewport.width / 4)), 0);
        expect(legacyBox.height).toBeCloseTo(180, 0);
    });

    test('fits the content, centred', async ({page}) => {
        const viewport = page.viewportSize()!;
        const panel = await openPopup(page, '/pps-fitted', 'Dopasowany');

        await expect.poll(async () => (await panel.boundingBox())!.width, {message: 'should fit the content width'})
            .toBeGreaterThanOrEqual(520);
        const box = (await panel.boundingBox())!;
        expect(box.width, 'no wider than the content plus chrome').toBeLessThan(580);
        expect(box.height, 'tall enough for the content').toBeGreaterThanOrEqual(200);
        expect(box.height, 'no taller than the content plus chrome').toBeLessThan(320);
        expect(Math.abs(box.x + box.width / 2 - viewport.width / 2), 'centred horizontally').toBeLessThan(2);
        expect(Math.abs(box.y + box.height / 2 - viewport.height / 2), 'centred vertically').toBeLessThan(2);
    });

    test('keeps oversized content on screen', async ({page}) => {
        const viewport = page.viewportSize()!;
        const panel = await openPopup(page, '/pps-huge', 'Wielki');

        await expect.poll(async () => (await panel.boundingBox())!.width, {message: 'should be capped to the screen'})
            .toBeCloseTo(viewport.width - 2 * MARGIN, 0);
        const box = (await panel.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(MARGIN - 1);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    });
});

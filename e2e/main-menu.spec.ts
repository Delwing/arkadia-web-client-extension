import { expect, test } from './support/fixtures';
import { ensureGameSocket, waitForCommandInput } from './support/mocks';

const panel = '.command-menu__panel';
const PLUGIN_URL = 'https://example.com/menu-entry-plugin.js';
const PLUGIN_SOURCE = `
export async function init(api) {
    api.ui.addPopupMenuEntry('Notatnik', () => { globalThis.__menuPicked = (globalThis.__menuPicked ?? 0) + 1; });
    return { name: 'Menu Test', version: '1.0.0' };
}
`;

test.describe('main menu', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('shows the entries in sections with the session bar', async ({ page }) => {
        await page.goto('/');
        await ensureGameSocket(page);
        await waitForCommandInput(page);

        await page.click('#menu-button');
        const menu = page.locator(panel);
        await expect(menu).toBeVisible();
        const captions = menu.locator('.command-menu__caption');
        await expect(captions).toHaveText(['Gra', 'Ustawienia', 'Narzędzia']);
        await expect(menu.locator('[data-group="gra"] .command-menu__item').first()).toHaveText('Automatyzacja');
        await expect(menu.locator('[data-group="narzedzia"] #docs-button')).toBeVisible();
        await expect(menu.locator('.command-menu__bar #fullscreen-button')).toBeVisible();
        await expect(menu.locator('.command-menu__bar #disconnect-button')).toHaveText('Rozłącz');
        await expect(menu.locator('.command-menu__status')).toHaveAttribute('data-status', 'connected');
        await page.screenshot({ path: 'test-results/main-menu-desktop.png' });
    });

    test('plugin entries go to Wtyczki', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await page.route(`${PLUGIN_URL}**`, (route) =>
            route.fulfill({ status: 200, contentType: 'application/javascript', body: PLUGIN_SOURCE }));

        await page.click('#menu-button');
        await page.click('#scripts-button');
        const modal = page.locator('#scripts-modal');
        await modal.getByRole('button', { name: 'Dodaj plugin' }).click();
        await page.locator('.plugin-route', { hasText: 'Z adresu URL' }).click();
        const dialog = page.locator('.popup-dialog', { hasText: 'Dodaj skrypt z URL' }).last();
        await dialog.getByPlaceholder('URL skryptu').fill(PLUGIN_URL);
        await dialog.getByRole('button', { name: 'Dodaj', exact: true }).click();
        await expect(modal.getByText('Menu Test')).toBeVisible();
        await modal.locator('.app-modal__close').first().click();
        await expect(modal).not.toBeVisible();

        await page.click('#menu-button');
        const entry = page.locator(`${panel} [data-group="wtyczki"] [data-plugin-menu-entry-id]`);
        await expect(entry).toHaveText('Notatnik');
        await entry.click();
        await expect(page.locator(panel)).toHaveCount(0);
        expect(await page.evaluate(() => (globalThis as { __menuPicked?: number }).__menuPicked)).toBe(1);
    });

    test('the filter narrows the list, accent-blind, and Enter runs the first match', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);

        await page.click('#menu-button');
        const filter = page.locator('#command-menu-filter');
        await expect(filter).toBeFocused();
        await filter.fill('zrodla');
        const items = page.locator(`${panel} .command-menu__sections .command-menu__item`);
        await expect(items).toHaveText(['Źródła danych']);
        await expect(page.locator('#data-sources-button')).toHaveClass(/is-first/);

        await filter.fill('xyzzy');
        await expect(page.locator('.command-menu__empty')).toBeVisible();

        // Automatyzacja is found by what it holds, too.
        await filter.fill('alia');
        await expect(items).toHaveText(['Automatyzacja']);
        await filter.press('Enter');
        await expect(page.locator(panel)).toHaveCount(0);
        await expect(page.locator('#automation-modal')).toBeVisible();
    });

    test('reopening starts with an empty filter', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);

        await page.click('#menu-button');
        await page.locator('#command-menu-filter').fill('trig');
        await page.keyboard.press('Escape');
        await expect(page.locator(panel)).toHaveCount(0);
        await page.click('#menu-button');
        await expect(page.locator('#command-menu-filter')).toHaveValue('');
    });
});

test.describe('main menu on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('is a bottom sheet of tiles with short labels', async ({ page }) => {
        await page.goto('/');
        await ensureGameSocket(page);
        await waitForCommandInput(page);

        await page.click('#menu-button');
        const menu = page.locator(`${panel}.command-menu__panel--sheet`);
        await expect(menu).toBeVisible();
        const box = await menu.boundingBox();
        expect(Math.round(box!.x)).toBe(0);
        expect(Math.round(box!.width)).toBe(390);
        // It stands on the command line, which stays usable: its menu button closes it.
        const bar = await page.locator('#input-area').boundingBox();
        expect(Math.round(box!.y + box!.height)).toBe(Math.round(bar!.y));
        await expect(menu.locator('.command-menu__caption')).toHaveText(['Gra', 'Ustawienia', 'Narzędzia i wtyczki']);
        await expect(menu.locator('#share-location-button')).toHaveText('Kod QR');
        await expect(menu.locator('#docs-button')).toHaveText('Pomoc');
        // No filter, and everything fits without scrolling.
        await expect(menu.locator('#command-menu-filter')).toHaveCount(0);
        const sections = menu.locator('.command-menu__sections');
        expect(await sections.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
        expect(box!.height).toBeLessThan(600);
        await page.screenshot({ path: 'test-results/main-menu-phone.png' });

        await page.locator('.command-menu__scrim').click({ position: { x: 20, y: 20 } });
        await expect(page.locator(panel)).toHaveCount(0);

        await page.click('#menu-button');
        await expect(menu).toBeVisible();
        await page.click('#menu-button');
        await expect(page.locator(panel)).toHaveCount(0);
    });
});

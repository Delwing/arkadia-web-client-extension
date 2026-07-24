import { test, expect } from './support/fixtures';

/**
 * The forge-ui command-rail menu: the "⋮" button in the rail opens a dropdown
 * mirroring the stock menu, and its items open forged modals (editors/docs) or
 * dockable popups.
 */
test.describe('forge menu', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/forge-ui/');
        // Disconnected, the login gate covers the HUD (LoginGate.tsx). Its close
        // button is what makes the client reachable before you have a game to
        // connect to; dismiss it to get at the rail.
        await page.locator('.gate__close').click();
        // The rail (and its menu button) render without a game connection.
        await expect(page.locator('.forge-menu__button')).toBeVisible();
    });

    test('opens the dropdown with the expected items', async ({ page }) => {
        await page.locator('.forge-menu__button').click();
        const list = page.locator('.forge-menu__list');
        await expect(list).toBeVisible();
        await expect(list.getByRole('button', { name: 'Triggery' })).toBeVisible();
        await expect(list.getByRole('button', { name: 'Skrypty' })).toBeVisible();
        await expect(list.getByRole('button', { name: 'Dokumentacja' })).toBeVisible();
        await expect(list.getByRole('button', { name: 'Ustawienia' })).toBeVisible();
    });

    test('opens the triggers editor in a forged modal', async ({ page }) => {
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Triggery' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('.panel__title')).toHaveText('Triggery');
        // Backdrop click dismisses it.
        await page.locator('.forge-menu-backdrop').click({ position: { x: 5, y: 5 } });
        await expect(modal).toHaveCount(0);
    });

    test('ui settings tabs isolate their panels', async ({ page }) => {
        // Regression: the tabbed settings panels hide inactive tabs with the
        // Bootstrap `.d-none` utility, which only existed in the (conditionally
        // loaded) stock global CSS — so opened cold, every tab's content used
        // to stack at once. forge's scoped Bootstrap subset now defines it.
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Interfejs' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();
        // Ogólne is the default tab: its content shows, the Mapa tab's is hidden.
        const general = modal.getByRole('heading', { name: 'Menedżer Okien' });
        const mapMarker = modal.getByRole('heading', { name: 'Marker gracza' });
        await expect(general).toBeVisible();
        await expect(mapMarker).toBeHidden();
        // Switching tabs swaps which panel is visible.
        await modal.getByRole('button', { name: 'Mapa', exact: true }).click();
        await expect(mapMarker).toBeVisible();
        await expect(general).toBeHidden();
    });

    test('opens the documentation with content', async ({ page }) => {
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Dokumentacja' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('.panel__title')).toHaveText('Dokumentacja');
        await expect(modal.locator('.docs-content')).not.toBeEmpty();
    });

    test('nested edit sub-modal opens as a centred overlay', async ({ page }) => {
        // The editors (Aliasy, Triggery, …) open their "add / edit" form as an
        // inline Bootstrap `.modal.show.d-block`. forge loads no global
        // Bootstrap, so without the scoped `.modal*` chrome in menu.css that
        // form used to dump into the list's flow with no header/footer framing.
        // It must instead render as a fixed, full-viewport overlay with a
        // bounded content card.
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Aliasy' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();

        await modal.getByRole('button', { name: 'Dodaj alias' }).click();
        const dialog = modal.locator('.modal.show');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveCSS('position', 'fixed');
        // The header lays out its title and close button on one row.
        await expect(dialog.locator('.modal-title')).toHaveText('Dodaj alias');
        await expect(dialog.locator('.modal-content')).toBeVisible();

        // Backdrop click on the sub-modal dismisses just it, not the list.
        await dialog.click({ position: { x: 5, y: 5 } });
        await expect(dialog).toHaveCount(0);
        await expect(modal).toBeVisible();
    });

    test('opening UI settings does not repaint the forge output', async ({ page }) => {
        // The Interfejs (UiSettings) modal live-previews the *stock* shell: its
        // apply() writes an inline background onto the shared output elements.
        // forge keeps its log transparent over the panel texture, so opening the
        // modal must not paint a flat stock background over the output (it used
        // to, and the paint stuck after closing). forge/style.css pins these
        // with !important.
        const output = page.locator('#main_text_output_msg_wrapper');
        const bgBefore = await output.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(bgBefore).toBe('rgba(0, 0, 0, 0)');

        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Interfejs', exact: true }).click();
        await expect(page.locator('.forge-menu-modal')).toBeVisible();
        // Even while the preview is live, forge's output stays transparent.
        await expect(output).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

        await page.keyboard.press('Escape');
        await expect(page.locator('.forge-menu-modal')).toHaveCount(0);
        // …and stays transparent after the modal closes.
        await expect(output).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    });
});

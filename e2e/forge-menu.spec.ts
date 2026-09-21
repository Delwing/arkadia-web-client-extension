import { test, expect } from './support/fixtures';

/**
 * The forge-ui command-rail menu: the "⋮" button in the rail opens a dropdown
 * mirroring the stock menu, and its items open forged modals (editors/docs) or
 * dockable popups.
 */
test.describe('forge menu', () => {
    let consoleIssues: string[] = [];

    test.beforeEach(async ({ page }) => {
        consoleIssues = [];
        // Attached before the first navigation so it also catches anything the
        // menu's background modal prefetch logs on startup.
        page.on('console', (msg) => {
            const type = msg.type();
            if (type === 'error' || type === 'warning') consoleIssues.push(msg.text());
        });
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

    test('Ustawienia and Interfejs open the same settings dialog on their own page', async ({ page }) => {
        const modal = page.locator('.forge-menu-modal');
        const visiblePage = modal.locator('.settings-page:not([hidden])');

        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Ustawienia' }).click();
        await expect(modal).toBeVisible();
        await expect(modal.locator('.panel__title')).toHaveText('Ustawienia');
        await expect(visiblePage).toHaveAttribute('data-settings-category', 'character-general');
        await page.keyboard.press('Escape');
        await expect(modal).toHaveCount(0);

        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Interfejs' }).click();
        await expect(modal).toBeVisible();
        await expect(modal.locator('.panel__title')).toHaveText('Ustawienia');
        await expect(visiblePage).toHaveAttribute('data-settings-category', 'ui-appearance');
    });

    test('settings pages isolate their panels', async ({ page }) => {
        // Regression: the settings panels hide inactive content with
        // `[hidden]` / `.d-none`, which only existed in the (conditionally
        // loaded) stock global CSS — so opened cold, every panel's content used
        // to stack at once. forge's scoped Bootstrap subset now defines it.
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Interfejs' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();
        // Wygląd is the default page: neither the Okna nor the Mapa page shows.
        const windows = modal.getByRole('heading', { name: 'Menedżer Okien' });
        const mapMarker = modal.getByRole('heading', { name: 'Marker gracza' });
        await expect(windows).toBeHidden();
        await expect(mapMarker).toBeHidden();
        // Switching pages swaps which panel is visible.
        await modal.locator('.settings-dialog__nav-item[data-settings-category="ui-windows"]').click();
        await expect(windows).toBeVisible();
        await expect(mapMarker).toBeHidden();
        await modal.locator('.settings-dialog__nav-item[data-settings-category="ui-map"]').click();
        await expect(mapMarker).toBeVisible();
        await expect(windows).toBeHidden();
    });

    test('opens the documentation with content', async ({ page }) => {
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Dokumentacja' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('.panel__title')).toHaveText('Dokumentacja');
        await expect(modal.locator('.docs-content')).not.toBeEmpty();
    });

    test('opens the log browser without stock-mount errors', async ({ page }) => {
        // `src/web/LogBrowser.tsx` used to mount itself into stock's
        // `#logs-button` / `#logs-modal` at import time, and on failure left a
        // MutationObserver on document.body that retried — and re-logged — on
        // every DOM mutation. forge imports the module for its component only
        // (and warms it via prefetchAllModals), so it spammed the console for
        // the whole session. The bootstrap now lives in logBrowserMount.tsx.
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Logi' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('.panel__title')).toHaveText('Logi');
        expect(consoleIssues.filter((line) => line.includes('[Logs]'))).toEqual([]);
    });

    test('nested edit sub-modal opens as a centred overlay', async ({ page }) => {
        // The editors (Aliasy, Triggery, …) open their "add / edit" form as the
        // shared inline Dialog (.popup-dialog). It must render as a fixed,
        // full-viewport overlay with a bounded content card, not dump into the
        // list's flow with no header/footer framing.
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Aliasy' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();

        await modal.getByRole('button', { name: 'Dodaj alias' }).click();
        // The overlay is the fixed backdrop; the card (.popup-dialog) sits inside it.
        const dialog = modal.locator('.popup-dialog-backdrop');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveCSS('position', 'fixed');
        // The header lays out its title and close button on one row.
        await expect(dialog.locator('.popup-dialog__title')).toHaveText('Dodaj alias');
        await expect(dialog.locator('.popup-dialog__body')).toBeVisible();

        // Backdrop click on the sub-modal dismisses just it, not the list.
        await dialog.click({ position: { x: 5, y: 5 } });
        await expect(dialog).toHaveCount(0);
        await expect(modal).toBeVisible();
    });

    test('the scripts panel owns its add-plugin dialogs', async ({ page }) => {
        // The "Wklej kod" / "Wygeneruj z AI" dialogs used to be markup in stock's
        // index.html that <Scripts/> drove by element id. forge's page carries no
        // such shells, so both buttons were silent no-ops here. The panel now
        // renders them itself, as inline overlays (not portaled react-bootstrap
        // dialogs, which lose their inputs to a focus fight — see Scripts.tsx).
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', { name: 'Skrypty' }).click();
        const modal = page.locator('.forge-menu-modal');
        await expect(modal).toBeVisible();

        const dialog = modal.locator('.popup-dialog');
        await modal.getByRole('button', { name: 'Dodaj plugin' }).click();
        await expect(dialog.locator('.popup-dialog__title')).toHaveText('Dodaj plugin');
        await dialog.locator('.plugin-route', { hasText: 'Wklej kod' }).click();
        await expect(dialog.locator('.popup-dialog__title')).toHaveText('Dodaj plugin z kodu');
        // Typing must land in the dialog's fields, not be swallowed by a trap.
        const code = dialog.getByPlaceholder('export async function init(api) { ... }');
        await code.click();
        await page.keyboard.type('export async function init() {}');
        await expect(code).toHaveValue('export async function init() {}');
        await dialog.getByRole('button', { name: 'Anuluj' }).click();
        await expect(dialog).toHaveCount(0);

        await modal.getByRole('button', { name: 'Dodaj plugin' }).click();
        await dialog.locator('.plugin-route', { hasText: 'Wygeneruj z AI' }).click();
        await expect(dialog.locator('.popup-dialog__title')).toHaveText('Wygeneruj plugin z AI');
        // "Mam kod, wklej go" hands over to the paste dialog.
        await dialog.getByRole('button', { name: 'Mam kod, wklej go' }).click();
        await expect(dialog.locator('.popup-dialog__title')).toHaveText('Dodaj plugin z kodu');
        await dialog.getByRole('button', { name: 'Anuluj' }).click();

        // The editor is a sibling entry at the app root; resolving its link
        // relative to this page would aim at the non-existent /forge-ui/editor/.
        await modal.getByRole('button', { name: 'Dodaj plugin' }).click();
        const [editor] = await Promise.all([
            page.waitForEvent('popup'),
            dialog.locator('.plugin-route', { hasText: 'Otworz edytor' }).click(),
        ]);
        expect(new URL(editor.url()).pathname).toBe('/editor/index.html');
        await editor.close();
    });

    test('opening UI settings does not repaint the forge output', async ({ page }) => {
        // The Interfejs (settings dialog) modal live-previews the *stock* shell: its
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

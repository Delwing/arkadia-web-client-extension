import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput, waitForOutputContaining} from './support/mocks';
import type {Page} from '@playwright/test';

const OUTPUT_SELECTOR = '#main_text_output_msg_wrapper';
const CONTEXT_MENU_SELECTOR = '#context-menu';

/**
 * Selects the output line holding `text` and right-clicks it, in one evaluate
 * so Playwright doesn't clear the selection between the two actions. The menu
 * is rendered asynchronously by React, so callers assert via locators.
 */
async function rightClickSelection(page: Page, text: string): Promise<void> {
    await page.evaluate(([sel, wanted]) => {
        const output = document.querySelector(sel) as HTMLElement;
        const span = Array.from(output.querySelectorAll('span')).find((el) => el.textContent?.includes(wanted))
            ?? output.firstChild;
        if (!span) return;
        const range = document.createRange();
        range.selectNodeContents(span);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        const rect = output.getBoundingClientRect();
        output.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + 40,
            clientY: rect.top + 40,
            button: 2,
        }));
    }, [OUTPUT_SELECTOR, text] as [string, string]);
}

test.describe('Context menu', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('right-click on output shows context menu with .show class', async ({page}) => {
        const output = page.locator(OUTPUT_SELECTOR);
        await output.click({button: 'right'});

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);
    });

    test('menu contains expected items', async ({page}) => {
        const output = page.locator(OUTPUT_SELECTOR);
        await output.click({button: 'right'});

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        await expect(menu).toContainText('Znaczniki czasu');
        await expect(menu).toContainText('Wiedza');
        await expect(menu).toContainText('Biblioteki');
        await expect(menu).toContainText('Chat');
        await expect(menu).toContainText('Walka');
    });

    test('sections: view toggles as checkmarks, then every window as a tile', async ({page}) => {
        const output = page.locator(OUTPUT_SELECTOR);
        await output.click({button: 'right'});

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu.locator('.context-menu__caption')).toHaveText(['Widok', 'Okna']);
        await expect(menu.locator('.context-menu__item')).toHaveText(['Znaczniki czasu', 'Typy wiadomości']);
        // All of them, always: no search and no "+N".
        const tiles = menu.locator('.context-menu__tiles .context-menu__tile');
        await expect(tiles).toHaveCount(24);
        await expect(tiles.first()).toHaveText('Wiedza');
        await expect(tiles.last()).toHaveText('Oswajanie');
        const columns = await menu.locator('.context-menu__tiles').evaluate(
            (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
        );
        expect(columns).toBe(4);
    });

    test('a window that is already open has a dot on its tile', async ({page}) => {
        const output = page.locator(OUTPUT_SELECTOR);
        await output.click({button: 'right'});
        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu.locator('.context-menu__open-dot')).toHaveCount(0);
        await menu.locator('.context-menu__tile', {hasText: 'Wiedza'}).click();
        await expect(page.locator('.knowledge-window')).toBeVisible({timeout: 5000});

        // Unpinned windows close on a click elsewhere; a pinned one stays open.
        const pin = page.locator('button[title="Przypnij okno"]').last();
        await pin.click();
        await expect(page.locator('.panel-button--pin.is-active')).toHaveCount(1);
        // The window now covers the middle of the output: right-click its free edge.
        const box = (await output.boundingBox())!;
        await output.click({button: 'right', position: {x: box.width - 30, y: box.height - 60}});
        await expect(menu.locator('.context-menu__tile.is-active')).toHaveText(['Wiedza', 'Biblioteki']);
        // Wiedza and Biblioteki are one window, so both tiles have the dot.
        await expect(menu.locator('.context-menu__open-dot')).toHaveCount(2);
    });

    test('clicking a menu item hides the menu', async ({page}) => {
        const output = page.locator(OUTPUT_SELECTOR);
        await output.click({button: 'right'});

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const firstButton = menu.locator('button').first();
        await firstButton.click();

        await expect(menu).not.toBeVisible();
    });

    test('clicking Wiedza triggers /wiedza command', async ({page}) => {
        const output = page.locator(OUTPUT_SELECTOR);
        await output.click({button: 'right'});

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const wiedzaButton = menu.locator('.context-menu__tile', {hasText: 'Wiedza'});
        await wiedzaButton.click();

        // /wiedza is a client-side alias that opens the knowledge details report popup.
        await expect(page.locator('.knowledge-window')).toBeVisible({timeout: 5000});
    });

    test('timestamp toggle adds/removes output-show-timestamps class', async ({page}) => {
        const output = page.locator(OUTPUT_SELECTOR);

        // Check initial state
        const initialHasTimestamps = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el?.classList.contains('output-show-timestamps') ?? false;
        }, OUTPUT_SELECTOR);

        // Right-click and toggle timestamps
        await output.click({button: 'right'});
        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const timestampButton = menu.locator('button', {hasText: 'Znaczniki czasu'});
        await expect(timestampButton.locator('.context-menu__icon--check svg')).toHaveCount(initialHasTimestamps ? 1 : 0);
        await timestampButton.click();

        // Wait for class change after toggle
        await page.waitForFunction(([sel, initial]) => {
            const el = document.querySelector(sel);
            const has = el?.classList.contains('output-show-timestamps') ?? false;
            return has !== initial;
        }, [OUTPUT_SELECTOR, initialHasTimestamps] as [string, boolean]);

        const afterToggle = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el?.classList.contains('output-show-timestamps') ?? false;
        }, OUTPUT_SELECTOR);

        // The state should have changed
        expect(afterToggle).not.toBe(initialHasTimestamps);
    });

    test('right-click on a clickable element does NOT show custom context menu', async ({page}) => {
        // Insert a clickable link directly into the output
        await page.evaluate((sel) => {
            const output = document.querySelector(sel);
            if (output) {
                const link = document.createElement('a');
                link.href = 'https://example.com';
                link.textContent = 'Click me';
                link.id = 'test-link';
                output.appendChild(link);
            }
        }, OUTPUT_SELECTOR);

        const link = page.locator('#test-link');
        await link.click({button: 'right'});
        // Short wait to confirm custom menu does not appear (negative assertion)
        await page.waitForTimeout(200);

        const hasShow = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el?.classList.contains('show') ?? false;
        }, CONTEXT_MENU_SELECTOR);

        expect(hasShow).toBe(false);
    });

    test('narrow viewport does NOT show custom context menu', async ({page}) => {
        await page.setViewportSize({width: 600, height: 800});

        const output = page.locator(OUTPUT_SELECTOR);
        await output.click({button: 'right'});
        // Short wait to confirm custom menu does not appear on narrow viewport (negative assertion)
        await page.waitForTimeout(200);

        const hasShow = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el?.classList.contains('show') ?? false;
        }, CONTEXT_MENU_SELECTOR);

        expect(hasShow).toBe(false);
    });

    test('without selection, Kopiuj jako obraz and Zapisz jako HTML are absent', async ({page}) => {
        const output = page.locator(OUTPUT_SELECTOR);
        await output.click({button: 'right'});

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const menuHtml = await menu.innerHTML();
        expect(menuHtml).not.toContain('Kopiuj jako obraz');
        expect(menuHtml).not.toContain('Zapisz jako HTML');
        await expect(menu.locator('.context-menu__caption')).not.toContainText(['Zaznaczenie']);
    });

    test('with selection, Zaznaczenie leads: Kopiuj with its key, and a log search for it', async ({page}) => {
        await pushText(page, 'Goblin atakuje cie\n');
        await waitForOutputContaining(page, 'Goblin atakuje cie');
        await rightClickSelection(page, 'Goblin atakuje cie');

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu.locator('.context-menu__caption').first()).toHaveText('Zaznaczenie');
        await expect(menu.locator('.context-menu__item', {hasText: 'Kopiuj'}).first().locator('.context-menu__hint'))
            .toHaveText('Ctrl+C');

        await menu.locator('.context-menu__item', {hasText: 'Szukaj w logach'}).click();
        await page.waitForSelector('#logs-modal.show', {timeout: 5000});
        await expect(page.locator('#lv-search')).toHaveValue('Goblin atakuje cie');
        await expect(page.locator('.lv-segmented__item[data-state="on"]', {hasText: 'Wszystkie logi'}))
            .toHaveCount(1);
    });

    test('with selection, Kopiuj jako obraz and Zapisz jako HTML appear', async ({page}) => {
        await pushText(page, 'Some selectable text here\n');
        await waitForOutputContaining(page, 'Some selectable text here');
        await rightClickSelection(page, 'Some selectable text here');

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);
        await expect(menu).toContainText('Kopiuj jako obraz');
        await expect(menu).toContainText('Zapisz jako HTML');
    });
});

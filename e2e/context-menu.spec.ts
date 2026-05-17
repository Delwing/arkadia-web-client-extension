import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput, waitForOutputContaining} from './support/mocks';

const OUTPUT_SELECTOR = '#main_text_output_msg_wrapper';
const CONTEXT_MENU_SELECTOR = '#context-menu';

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

        await expect(menu).toContainText('znaczniki czasu');
        await expect(menu).toContainText('Wiedza');
        await expect(menu).toContainText('Biblioteki');
        await expect(menu).toContainText('Chat');
        await expect(menu).toContainText('Walka');
    });

    test('menu uses 2-column layout', async ({page}) => {
        const output = page.locator(OUTPUT_SELECTOR);
        await output.click({button: 'right'});

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/context-menu--columns-2/);

        const buttonsContainer = menu.locator('.context-menu-buttons');
        await expect(buttonsContainer).toBeVisible();
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

        const wiedzaButton = menu.locator('button', {hasText: 'Wiedza'}).first();
        await wiedzaButton.click();

        // /wiedza is a client-side alias that opens the knowledge details report popup.
        await expect(page.getByText('Raport wiedzy')).toBeVisible({timeout: 5000});
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

        const timestampButton = menu.locator('button', {hasText: 'znaczniki czasu'}).first();
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
    });

    test('with selection, Kopiuj jako obraz and Zapisz jako HTML appear', async ({page}) => {
        await pushText(page, 'Some selectable text here\n');
        await waitForOutputContaining(page, 'Some selectable text here');

        // Select text and dispatch contextmenu in one evaluate so Playwright
        // doesn't clear the selection between the two actions. The menu is
        // rendered asynchronously by React, so we assert via the Playwright
        // locator afterwards rather than reading the DOM synchronously here.
        await page.evaluate((sel) => {
            const output = document.querySelector(sel) as HTMLElement;
            if (!output) return;

            const textNode = output.querySelector('span') ?? output.firstChild;
            if (!textNode) return;
            const range = document.createRange();
            range.selectNodeContents(textNode);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);

            const rect = output.getBoundingClientRect();
            const event = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
                button: 2,
            });
            output.dispatchEvent(event);
        }, OUTPUT_SELECTOR);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);
        await expect(menu).toContainText('Kopiuj jako obraz');
        await expect(menu).toContainText('Zapisz jako HTML');
    });
});

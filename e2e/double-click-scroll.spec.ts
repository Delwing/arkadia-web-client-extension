import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

const OUTPUT_SELECTOR = '#main_text_output_msg_wrapper';

async function pushManyLines(page: Page, count: number): Promise<void> {
    const lines = Array.from({length: count}, (_, i) => `Line ${i + 1}`).join('\n') + '\n';
    await pushText(page, lines);
    await page.waitForTimeout(200);
}

async function isScrolledToBottom(page: Page): Promise<boolean> {
    return await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (!el) return false;
        return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    }, OUTPUT_SELECTOR);
}

async function scrollOutputToTop(page: Page): Promise<void> {
    await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (el) el.scrollTop = 0;
    }, OUTPUT_SELECTOR);
    await page.waitForTimeout(300);
}

test.describe('Double-click scroll to bottom', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('double-clicking output when scrolled up scrolls to bottom', async ({page}) => {
        await pushManyLines(page, 80);

        await scrollOutputToTop(page);
        expect(await isScrolledToBottom(page)).toBe(false);

        // Perform two rapid clicks (double click) on the output
        const box = await page.locator(OUTPUT_SELECTOR).boundingBox();
        const cx = box!.x + box!.width / 2;
        const cy = box!.y + box!.height / 2;
        await page.mouse.click(cx, cy);
        await page.mouse.click(cx, cy);
        await page.waitForTimeout(500);

        expect(await isScrolledToBottom(page)).toBe(true);
    });

    test('single click does NOT scroll to bottom', async ({page}) => {
        await pushManyLines(page, 80);

        await scrollOutputToTop(page);
        expect(await isScrolledToBottom(page)).toBe(false);

        // Single click via dispatch to avoid focus side effects
        await page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLElement;
            if (el) {
                el.dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
            }
        }, OUTPUT_SELECTOR);
        await page.waitForTimeout(500);

        expect(await isScrolledToBottom(page)).toBe(false);
    });

    test('double-click at bottom has no adverse effect', async ({page}) => {
        await pushManyLines(page, 80);

        expect(await isScrolledToBottom(page)).toBe(true);

        const output = page.locator(OUTPUT_SELECTOR);
        await output.dblclick();
        await page.waitForTimeout(500);

        expect(await isScrolledToBottom(page)).toBe(true);
    });
});

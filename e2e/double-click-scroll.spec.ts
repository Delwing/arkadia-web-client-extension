import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput, waitForOutputContaining} from './support/mocks';
import type {Page} from '@playwright/test';

const OUTPUT_SELECTOR = '#main_text_output_msg_wrapper';

async function pushManyLines(page: Page, count: number): Promise<void> {
    const lines = Array.from({length: count}, (_, i) => `Line ${i + 1}`).join('\n') + '\n';
    await pushText(page, lines);
    await waitForOutputContaining(page, `Line ${count}`);
}

async function isScrolledToBottom(page: Page): Promise<boolean> {
    return await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (!el) return false;
        return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    }, OUTPUT_SELECTOR);
}

// A scroll within 250ms of new output is ignored by the split-view detection and
// the next pin snaps the view back down. Retry until split view actually opens,
// which is what keeps the output scrolled up. Nudging off 0 first makes every
// attempt fire a scroll event, even when the ignored one left it at the top.
async function scrollOutputToTop(page: Page): Promise<void> {
    await expect(async () => {
        await page.evaluate(async (sel) => {
            const el = document.querySelector(sel) as HTMLElement;
            if (!el) return;
            el.scrollTop = 1;
            await new Promise(requestAnimationFrame);
            el.scrollTop = 0;
        }, OUTPUT_SELECTOR);
        await expect(page.locator('#split-bottom')).not.toHaveClass(/split-hidden/, {timeout: 500});
    }).toPass({timeout: 10000});
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

        await page.waitForFunction((sel) => {
            const el = document.querySelector(sel) as HTMLElement;
            if (!el) return false;
            return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
        }, OUTPUT_SELECTOR);

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
        // Short wait to confirm single click does not scroll (negative assertion)
        await page.waitForTimeout(200);

        expect(await isScrolledToBottom(page)).toBe(false);
    });

    test('double-click at bottom has no adverse effect', async ({page}) => {
        await pushManyLines(page, 80);

        expect(await isScrolledToBottom(page)).toBe(true);

        const output = page.locator(OUTPUT_SELECTOR);
        await output.dblclick();
        // Short wait to confirm double-click at bottom doesn't break state (negative assertion)
        await page.waitForTimeout(200);

        expect(await isScrolledToBottom(page)).toBe(true);
    });
});

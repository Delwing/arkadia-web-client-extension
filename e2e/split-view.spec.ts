import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput, waitForOutputContaining} from './support/mocks';
import type {Page} from '@playwright/test';

const OUTPUT_SELECTOR = '#main_text_output_msg_wrapper';
const SPLIT_BOTTOM_SELECTOR = '#split-bottom';
const STICKY_AREA_SELECTOR = '#sticky-area';

async function pushManyLines(page: Page, count: number): Promise<void> {
    const lines = Array.from({length: count}, (_, i) => `Line ${i + 1}`).join('\n') + '\n';
    await pushText(page, lines);
    await waitForOutputContaining(page, `Line ${count}`);
}

// Long lines matter for the resize tests: only text that actually rewraps makes
// scrollHeight change with the wrapper's width.
async function pushManyLongLines(page: Page, count: number): Promise<void> {
    const filler = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor '.repeat(4);
    const lines = Array.from({length: count}, (_, i) => `Line ${i + 1} ${filler}`).join('\n') + '\n';
    await pushText(page, lines);
    await waitForOutputContaining(page, `Line ${count}`);
}

async function scrollOutputToTop(page: Page): Promise<void> {
    // Wait for any suppress timer to expire (content push triggers 500ms suppress via ResizeObserver)
    await page.waitForTimeout(600);
    await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (el) el.scrollTop = 0;
    }, OUTPUT_SELECTOR);
    // Wait for scroll handler to fire and split view to activate (removes split-hidden)
    await page.waitForFunction(() => {
        const splitBottom = document.querySelector('#split-bottom');
        return splitBottom ? !splitBottom.classList.contains('split-hidden') : false;
    }, {timeout: 5000});
}

async function scrollOutputToBottom(page: Page): Promise<void> {
    // Wait for any suppress timer to expire (split view activation triggers 150ms suppress)
    await page.waitForTimeout(200);
    await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (el) el.scrollTop = el.scrollHeight;
    }, OUTPUT_SELECTOR);
    // Wait for scroll handler to fire and split view to react (adds split-hidden)
    await page.waitForFunction(() => {
        const splitBottom = document.querySelector('#split-bottom');
        return splitBottom ? splitBottom.classList.contains('split-hidden') : false;
    }, {timeout: 5000});
}

async function hasSplitHidden(page: Page): Promise<boolean> {
    return await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el?.classList.contains('split-hidden') ?? false;
    }, SPLIT_BOTTOM_SELECTOR);
}

async function getStickyAreaChildCount(page: Page): Promise<number> {
    return await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el?.children.length ?? 0;
    }, STICKY_AREA_SELECTOR);
}

test.describe('Split view', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        // Wait for suppressSplitViewUntil timer to expire after initial content push
        await page.waitForFunction(() => {
            const el = document.querySelector('#split-bottom');
            return el?.classList.contains('split-hidden') ?? false;
        }, {timeout: 5000});
    });

    test('split-bottom starts with split-hidden class', async ({page}) => {
        expect(await hasSplitHidden(page)).toBe(true);
    });

    test('scrolling output up removes split-hidden and populates sticky area', async ({page}) => {
        await pushManyLines(page, 80);

        await scrollOutputToTop(page);

        expect(await hasSplitHidden(page)).toBe(false);

        const stickyCount = await getStickyAreaChildCount(page);
        expect(stickyCount).toBeGreaterThan(0);
    });

    test('scrolling back to bottom restores split-hidden and clears sticky area', async ({page}) => {
        await pushManyLines(page, 80);

        await scrollOutputToTop(page);
        expect(await hasSplitHidden(page)).toBe(false);

        await scrollOutputToBottom(page);
        expect(await hasSplitHidden(page)).toBe(true);

        const stickyCount = await getStickyAreaChildCount(page);
        expect(stickyCount).toBe(0);
    });

    test('sticky area has at most 15 cloned lines', async ({page}) => {
        await pushManyLines(page, 80);

        await scrollOutputToTop(page);

        const stickyCount = await getStickyAreaChildCount(page);
        expect(stickyCount).toBeLessThanOrEqual(15);
    });

    test('resizing the window does not open split view', async ({page}) => {
        await pushManyLongLines(page, 200);
        // Let the append suppression window expire, so a stray scroll would be
        // free to open the split view.
        await page.waitForTimeout(600);
        expect(await hasSplitHidden(page)).toBe(true);

        const viewport = page.viewportSize();
        if (!viewport) throw new Error('viewport size unavailable');

        // Narrower at the same height: the scrollback rewraps and grows, so the
        // old scroll offset is no longer the bottom and the browser fires a
        // scroll event for it. That is layout churn, not the user scrolling up.
        await page.setViewportSize({width: Math.round(viewport.width * 0.55), height: viewport.height});
        await page.waitForTimeout(600);
        expect(await hasSplitHidden(page)).toBe(true);
        expect(await getStickyAreaChildCount(page)).toBe(0);

        // Shorter at the same width.
        await page.setViewportSize({
            width: Math.round(viewport.width * 0.55),
            height: Math.round(viewport.height * 0.6),
        });
        await page.waitForTimeout(600);
        expect(await hasSplitHidden(page)).toBe(true);

        // And back again.
        await page.setViewportSize(viewport);
        await page.waitForTimeout(600);
        expect(await hasSplitHidden(page)).toBe(true);
    });

    test('resizing the window keeps split view open while scrolled up', async ({page}) => {
        await pushManyLongLines(page, 200);
        await scrollOutputToTop(page);
        expect(await hasSplitHidden(page)).toBe(false);

        const viewport = page.viewportSize();
        if (!viewport) throw new Error('viewport size unavailable');

        await page.setViewportSize({
            width: Math.round(viewport.width * 0.6),
            height: Math.round(viewport.height * 0.7),
        });
        await page.waitForTimeout(600);

        expect(await hasSplitHidden(page)).toBe(false);
        expect(await getStickyAreaChildCount(page)).toBeGreaterThan(0);
    });

    test('enlarging the window does not close split view when scrolled up near the bottom', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 500});
        await pushManyLines(page, 200);

        // Scroll up by less than the height the window is about to gain, so the
        // browser has to clamp the scroll offset back to the bottom — which used
        // to read as "the user scrolled to the bottom" and close the split view.
        await page.waitForTimeout(600);
        await page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLElement;
            el.scrollTop = el.scrollHeight - el.clientHeight - 150;
        }, OUTPUT_SELECTOR);
        await page.waitForFunction(() => {
            const splitBottom = document.querySelector('#split-bottom');
            return splitBottom ? !splitBottom.classList.contains('split-hidden') : false;
        }, {timeout: 5000});

        // Past the suppression window the split view's own opening sets up, so
        // the resize below is judged on its own.
        await page.waitForTimeout(400);
        await page.setViewportSize({width: 1280, height: 1000});
        await page.waitForTimeout(600);

        expect(await hasSplitHidden(page)).toBe(false);
    });

    test('new messages keep split view active when scrolled up', async ({page}) => {
        await pushManyLines(page, 80);

        await scrollOutputToTop(page);
        expect(await hasSplitHidden(page)).toBe(false);

        await pushText(page, 'New message after split\n');
        await waitForOutputContaining(page, 'New message after split');

        // Split view should still be active since we're scrolled up
        expect(await hasSplitHidden(page)).toBe(false);
    });
});

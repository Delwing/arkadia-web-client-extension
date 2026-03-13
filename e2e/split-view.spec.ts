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

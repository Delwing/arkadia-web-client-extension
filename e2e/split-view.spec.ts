import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

const OUTPUT_SELECTOR = '#main_text_output_msg_wrapper';
const SPLIT_BOTTOM_SELECTOR = '#split-bottom';
const STICKY_AREA_SELECTOR = '#sticky-area';

async function pushManyLines(page: Page, count: number): Promise<void> {
    const lines = Array.from({length: count}, (_, i) => `Line ${i + 1}`).join('\n') + '\n';
    await pushText(page, lines);
    // Wait for content rendering and suppress timer to expire
    await page.waitForTimeout(600);
}

async function scrollOutputToTop(page: Page): Promise<void> {
    await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (el) el.scrollTop = 0;
    }, OUTPUT_SELECTOR);
    // Wait long enough for the scroll handler to fire and suppress timer to clear
    await page.waitForTimeout(400);
}

async function scrollOutputToBottom(page: Page): Promise<void> {
    await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (el) el.scrollTop = el.scrollHeight;
    }, OUTPUT_SELECTOR);
    await page.waitForTimeout(400);
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
        await page.waitForTimeout(800);
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
        await page.waitForTimeout(300);

        // Split view should still be active since we're scrolled up
        expect(await hasSplitHidden(page)).toBe(false);
    });
});

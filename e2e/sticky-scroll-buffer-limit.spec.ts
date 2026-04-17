import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput, waitForOutputContaining} from './support/mocks';
import type {Page} from '@playwright/test';

const OUTPUT_SELECTOR = '#main_text_output_msg_wrapper';
const SPLIT_BOTTOM_SELECTOR = '#split-bottom';

// Default maxElements in setupOutputMessageHandler is 1000. Pushing past it
// exercises the trim path that used to shift the user's view when scrolled up.
const BUFFER_LIMIT = 1000;

async function pushLinesRange(page: Page, from: number, to: number): Promise<void> {
    // Push each line as its own gmcp_msgs so each becomes a separate .output_msg
    // element. Batching with "\n" into one payload would make the client
    // pipeline merge same-type messages into one DOM node.
    await page.evaluate(({start, end}) => {
        const pushTextFn = (window as any).__pushText as (text: string, type: string) => void;
        if (typeof pushTextFn !== 'function') {
            throw new Error('Mock WebSocket not initialized');
        }
        for (let i = start; i <= end; i++) {
            pushTextFn(`Line ${i}`, 'comm');
        }
    }, {start: from, end: to});
    await waitForOutputContaining(page, `Line ${to}`);
}

async function getLineTop(page: Page, lineNumber: number): Promise<number | null> {
    return await page.evaluate((n) => {
        const wrapper = document.querySelector('#main_text_output_msg_wrapper');
        if (!wrapper) return null;
        const messages = wrapper.querySelectorAll('.output_msg');
        const needle = `Line ${n}`;
        for (const msg of Array.from(messages)) {
            const contentEl = msg.querySelector('.output_msg_content');
            const text = (contentEl?.textContent ?? '').trim();
            if (text === needle) {
                return (msg as HTMLElement).getBoundingClientRect().top;
            }
        }
        return null;
    }, lineNumber);
}

async function getSplitBottomTop(page: Page): Promise<number> {
    return await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        return el ? el.getBoundingClientRect().top : -1;
    }, SPLIT_BOTTOM_SELECTOR);
}

async function getBufferLineCount(page: Page): Promise<number> {
    return await page.evaluate((sel) => {
        const wrapper = document.querySelector(sel);
        if (!wrapper) return 0;
        return wrapper.querySelectorAll('.output_msg').length;
    }, OUTPUT_SELECTOR);
}

async function getLineRange(page: Page): Promise<{min: number; max: number; count: number}> {
    return await page.evaluate(() => {
        const wrapper = document.querySelector('#main_text_output_msg_wrapper');
        if (!wrapper) return {min: -1, max: -1, count: 0};
        const messages = wrapper.querySelectorAll('.output_msg .output_msg_content');
        let min = Infinity;
        let max = -Infinity;
        let count = 0;
        for (const el of Array.from(messages)) {
            const text = (el.textContent ?? '').trim();
            const m = /^Line (\d+)$/.exec(text);
            if (m) {
                const n = parseInt(m[1], 10);
                if (n < min) min = n;
                if (n > max) max = n;
                count++;
            }
        }
        return {
            min: Number.isFinite(min) ? min : -1,
            max: Number.isFinite(max) ? max : -1,
            count,
        };
    });
}

test.describe('Sticky scroll during buffer overflow', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await page.waitForFunction(() => {
            const el = document.querySelector('#split-bottom');
            return el?.classList.contains('split-hidden') ?? false;
        }, {timeout: 5000});
    });

    test('no content is deleted while split view is active, and the visible content stays put', async ({page}) => {
        // Fill the buffer below limit — no pressure yet.
        await pushLinesRange(page, 1, 800);

        // Scroll up to activate split view.
        await page.waitForTimeout(600);
        await page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLElement;
            el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) * 0.5);
        }, OUTPUT_SELECTOR);
        await page.waitForFunction(() => {
            const el = document.querySelector('#split-bottom');
            return el ? !el.classList.contains('split-hidden') : false;
        }, {timeout: 5000});
        await page.waitForTimeout(300);

        const rangeBefore = await getLineRange(page);
        console.log(`[diag] before overflow: lines ${rangeBefore.min}..${rangeBefore.max} (count=${rangeBefore.count})`);

        // Track line 100 — comfortably inside the region we'd normally trim
        // first. If trimming still happens during split view, this line would
        // vanish from the DOM.
        const ANCHOR_LINE = 100;
        const stickyBottomBefore = await getSplitBottomTop(page);
        const anchorBefore = await getLineTop(page, ANCHOR_LINE);
        expect(
            anchorBefore,
            `Line ${ANCHOR_LINE} should be rendered before overflow (range=${rangeBefore.min}..${rangeBefore.max})`,
        ).not.toBeNull();

        // Push enough extra lines to comfortably exceed maxElements + trimSlack.
        const startExtra = 801;
        const endExtra = BUFFER_LIMIT + 500; // total 1500
        const CHUNK = 100;
        for (let from = startExtra; from <= endExtra; from += CHUNK) {
            const to = Math.min(from + CHUNK - 1, endExtra);
            await pushLinesRange(page, from, to);
        }

        // Split view must still be active — user never scrolled back down.
        await expect.poll(async () =>
            await page.evaluate(() => {
                const el = document.querySelector('#split-bottom');
                return el?.classList.contains('split-hidden') ?? true;
            })
        ).toBe(false);

        await page.waitForTimeout(300);

        const rangeAfter = await getLineRange(page);
        console.log(`[diag] after overflow: lines ${rangeAfter.min}..${rangeAfter.max} (count=${rangeAfter.count})`);

        // Invariant #1: nothing was deleted while split view was active.
        // The oldest line we pushed (1) should still be in the DOM.
        expect(rangeAfter.min).toBe(1);

        // Invariant #2: the anchored line is still rendered at the same
        // viewport Y — the user's view did not shift.
        const anchorAfter = await getLineTop(page, ANCHOR_LINE);
        expect(
            anchorAfter,
            `Line ${ANCHOR_LINE} should still be rendered (range=${rangeAfter.min}..${rangeAfter.max})`,
        ).not.toBeNull();

        const stickyBottomAfter = await getSplitBottomTop(page);
        const anchorDrift = Math.abs((anchorAfter as number) - (anchorBefore as number));
        const stickyDrift = Math.abs(stickyBottomAfter - stickyBottomBefore);

        expect(
            anchorDrift,
            `Anchor line ${ANCHOR_LINE} drifted by ${anchorDrift}px (before=${anchorBefore}, after=${anchorAfter})`,
        ).toBeLessThanOrEqual(4);
        expect(
            stickyDrift,
            `split-bottom sticky area drifted by ${stickyDrift}px (before=${stickyBottomBefore}, after=${stickyBottomAfter})`,
        ).toBeLessThanOrEqual(4);
    });

    test('deferred trim drains when the user scrolls back to the bottom', async ({page}) => {
        await pushLinesRange(page, 1, 800);

        // Enter split view and push enough to far exceed the limit.
        await page.waitForTimeout(600);
        await page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLElement;
            el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) * 0.5);
        }, OUTPUT_SELECTOR);
        await page.waitForFunction(() => {
            const el = document.querySelector('#split-bottom');
            return el ? !el.classList.contains('split-hidden') : false;
        }, {timeout: 5000});
        await page.waitForTimeout(300);

        for (let from = 801; from <= BUFFER_LIMIT + 500; from += 100) {
            const to = Math.min(from + 99, BUFFER_LIMIT + 500);
            await pushLinesRange(page, from, to);
        }

        const bufferedDuringSplit = await getBufferLineCount(page);
        expect(bufferedDuringSplit).toBeGreaterThan(BUFFER_LIMIT + 100);

        // Scroll back to the bottom; the next incoming message should drain
        // the deferred backlog down to maxElements.
        await page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLElement;
            el.scrollTop = el.scrollHeight;
        }, OUTPUT_SELECTOR);
        await page.waitForFunction(() => {
            const el = document.querySelector('#split-bottom');
            return el?.classList.contains('split-hidden') ?? false;
        }, {timeout: 5000});
        await page.waitForTimeout(300);

        // Trigger one more message so the handler's trim path runs.
        await pushLinesRange(page, 2000, 2000);

        const bufferedAfterDrain = await getBufferLineCount(page);
        expect(bufferedAfterDrain).toBeLessThanOrEqual(BUFFER_LIMIT + 1);
    });
});

import {expect, test} from './support/fixtures';
import {ensureGameSocket, primeCharInfo, waitForCommandInput, waitForOutputContaining} from './support/mocks';
import type {Page} from '@playwright/test';

const OUTPUT_SELECTOR = '#main_text_output_msg_wrapper';

// Push raw gmcp_msgs chunks verbatim — unlike the pushText helper this does NOT
// append a trailing newline, so we can reproduce a server that splits one
// logical line across several messages/frames.
async function pushRawChunks(page: Page, chunks: Array<{text: string; type: string}>): Promise<void> {
    await page.evaluate((items) => {
        const pushGmcp = (window as any).__pushGmcp as (path: string, payload: unknown) => void;
        if (typeof pushGmcp !== 'function') {
            throw new Error('Mock WebSocket not initialized');
        }
        for (const {text, type} of items) {
            pushGmcp('gmcp_msgs', {type, text: btoa(text)});
        }
    }, chunks);
}

async function getRenderedLines(page: Page): Promise<string[]> {
    return await page.evaluate((sel) => {
        const wrapper = document.querySelector(sel);
        if (!wrapper) return [];
        return Array.from(wrapper.querySelectorAll('.output_msg .output_msg_content')).map(
            (el) => (el.textContent ?? '').trim(),
        );
    }, OUTPUT_SELECTOR);
}

test.describe('gmcp_msgs partial line handling', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    test('a line split across two messages renders as one line', async ({page}) => {
        // First message lacks the terminating newline — it is a partial line and
        // must be held until the continuation arrives, not rendered on its own.
        await pushRawChunks(page, [
            {text: 'Widzisz wielkiego ', type: 'comm'},
            {text: 'czerwonego smoka.\n', type: 'comm'},
        ]);

        await waitForOutputContaining(page, 'czerwonego smoka');

        const lines = await getRenderedLines(page);
        expect(
            lines,
            'the two messages should be joined into a single rendered line',
        ).toContain('Widzisz wielkiego czerwonego smoka.');
        expect(
            lines,
            'the partial first message must not render as its own line',
        ).not.toContain('Widzisz wielkiego');
    });

    test('a line split across three messages joins in order', async ({page}) => {
        await pushRawChunks(page, [
            {text: 'Czesc ', type: 'comm'},
            {text: 'pierwsza, czesc ', type: 'comm'},
            {text: 'druga, czesc trzecia.\n', type: 'comm'},
        ]);

        await waitForOutputContaining(page, 'czesc trzecia');

        const lines = await getRenderedLines(page);
        expect(lines).toContain('Czesc pierwsza, czesc druga, czesc trzecia.');
    });

    test('newline-terminated messages remain separate lines', async ({page}) => {
        await pushRawChunks(page, [
            {text: 'Linia pierwsza.\n', type: 'comm'},
            {text: 'Linia druga.\n', type: 'comm'},
        ]);

        await waitForOutputContaining(page, 'Linia druga');

        const lines = await getRenderedLines(page);
        expect(lines, 'each complete line should render on its own row').toContain('Linia pierwsza.');
        expect(lines).toContain('Linia druga.');
        expect(
            lines,
            'complete lines must not be merged into one row',
        ).not.toContain('Linia pierwsza.Linia druga.');
    });

    test('an IAC GA prompt flushes a held partial line exactly once', async ({page}) => {
        // Hold a partial line (no trailing newline).
        await pushRawChunks(page, [{text: 'Wiadomosc konczona promptem', type: 'comm'}]);

        // Arkadia ends a burst with IAC GA — it must force the held partial out
        // (so the last line of a burst renders without waiting for the idle
        // fallback) and must not also leave the idle timer armed to re-emit it.
        await page.evaluate(() => {
            const push = (window as any).__pushIncoming as (text: string) => void;
            push(String.fromCharCode(255, 249)); // IAC GA
        });

        await waitForOutputContaining(page, 'Wiadomosc konczona promptem');

        const matches = (await getRenderedLines(page)).filter(
            (line) => line === 'Wiadomosc konczona promptem',
        );
        expect(matches, 'the GA-flushed line should render exactly once').toHaveLength(1);
    });

    test('different message types are not joined together', async ({page}) => {
        // A held partial of one type must never absorb a complete line of another
        // type. The completed comm line renders; the partial room.long fragment
        // stays held (it would flush on its own continuation, a prompt, or timeout).
        await pushRawChunks(page, [
            {text: 'Fragment opisu pokoju ', type: 'room.long'},
            {text: 'Pelna wiadomosc komunikacji.\n', type: 'comm'},
        ]);

        await waitForOutputContaining(page, 'Pelna wiadomosc komunikacji');

        const lines = await getRenderedLines(page);
        expect(
            lines,
            'the completed comm line should not absorb the held room.long fragment',
        ).not.toContain('Fragment opisu pokoju Pelna wiadomosc komunikacji.');
        expect(lines).toContain('Pelna wiadomosc komunikacji.');
    });
});

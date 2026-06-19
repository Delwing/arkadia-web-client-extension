import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    submitCommand,
    waitForCommandInput,
    pushGmcp,
    waitForCharacter,
    GMCP_PATHS,
} from './support/mocks';

const MESSAGE_INPUT = '#message-input';
const HISTORY_UP_BUTTON = '#history-up-button';
const HISTORY_DOWN_BUTTON = '#history-down-button';

async function getInputValue(page: Page): Promise<string> {
    return await page.locator(MESSAGE_INPUT).inputValue();
}

async function setInputValue(page: Page, value: string): Promise<void> {
    const input = page.locator(MESSAGE_INPUT);
    await input.focus();
    await input.fill(value);
}

async function pressArrowUp(page: Page): Promise<void> {
    const input = page.locator(MESSAGE_INPUT);
    await input.focus();
    await input.press('ArrowUp');
}

async function pressArrowDown(page: Page): Promise<void> {
    const input = page.locator(MESSAGE_INPUT);
    await input.focus();
    await input.press('ArrowDown');
}

async function pressEscape(page: Page): Promise<void> {
    const input = page.locator(MESSAGE_INPUT);
    await input.focus();
    await input.press('Escape');
}

async function getSelection(page: Page) {
    return await page.evaluate(() => {
        const input = document.querySelector<HTMLTextAreaElement>('#message-input');
        if (!input) return null;
        return {
            start: input.selectionStart,
            end: input.selectionEnd,
            length: input.value.length,
        };
    });
}

test.describe('Command history — Mudlet-style', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});
        await waitForCharacter(page, 'Tester');
    });

    // ── Full browse mode (input empty or all selected) ────────────────

    test('should store commands and browse newest-first', async ({page}) => {
        await submitCommand(page, 'look');
        await submitCommand(page, 'north');
        await submitCommand(page, 'south');

        // The just-sent command stays in the input (clearInputOnSend is off),
        // so browsing starts from the previous command — no double-press needed.
        expect(await getInputValue(page)).toBe('south');

        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('north');

        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('look');
    });

    test('first ArrowUp after sending skips the just-sent command', async ({page}) => {
        await submitCommand(page, 'alpha');
        await submitCommand(page, 'beta');

        // "beta" is already in the input; a single ArrowUp must reach "alpha"
        // (regression: previously it re-loaded "beta", requiring two presses).
        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('alpha');
    });

    test('should navigate down through history back to sentinel', async ({page}) => {
        await submitCommand(page, 'first');
        await submitCommand(page, 'second');
        await submitCommand(page, 'third');

        // Go up to oldest
        await pressArrowUp(page);
        await pressArrowUp(page);
        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('first');

        // Navigate back down
        await pressArrowDown(page);
        expect(await getInputValue(page)).toBe('second');

        await pressArrowDown(page);
        expect(await getInputValue(page)).toBe('third');

        // Down to sentinel (empty string)
        await pressArrowDown(page);
        expect(await getInputValue(page)).toBe('');
    });

    test('should not go past oldest command on ArrowUp', async ({page}) => {
        await submitCommand(page, 'only');

        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('only');

        // Should stay at oldest
        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('only');
    });

    test('should select entire text when browsing history', async ({page}) => {
        await submitCommand(page, 'test command');

        await pressArrowUp(page);

        const selection = await getSelection(page);
        expect(selection).not.toBeNull();
        expect(selection?.start).toBe(0);
        expect(selection?.end).toBe(selection?.length);
    });

    // ── Full deduplication ────────────────────────────────────────────

    test('should fully deduplicate on submit (not just consecutive)', async ({page}) => {
        await submitCommand(page, 'look');
        await submitCommand(page, 'north');
        await submitCommand(page, 'look');  // duplicate of first, should be removed from old position

        // History should be: ["", "look", "north"] (newest-first).
        // "look" is already in the input, so the first ArrowUp reaches "north".
        expect(await getInputValue(page)).toBe('look');

        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('north');

        // No more entries (look was fully deduped)
        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('north');
    });

    // ── Prefix auto-complete mode (partial text in input) ─────────────

    test('should enter prefix mode when input has unselected text', async ({page}) => {
        await submitCommand(page, 'look north');
        await submitCommand(page, 'attack goblin');
        await submitCommand(page, 'look south');
        await submitCommand(page, 'examine sword');
        await submitCommand(page, 'look east');

        // Type prefix — the text is NOT selected, so should enter prefix mode
        await setInputValue(page, 'look');

        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('look east');

        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('look south');

        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('look north');
    });

    // ── Escape key ────────────────────────────────────────────────────

    test('should reset state on Escape', async ({page}) => {
        await submitCommand(page, 'cmd1');
        await submitCommand(page, 'cmd2');

        // cmd2 is already in the input, so the first ArrowUp reaches cmd1
        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('cmd1');

        // Escape should select all and reset the browse position
        await pressEscape(page);

        // After the reset, browsing restarts from the top of history
        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('cmd2');
    });

    // ── Button navigation ─────────────────────────────────────────────

    test('should work with history buttons', async ({page}) => {
        await submitCommand(page, 'cmd1');
        await submitCommand(page, 'cmd2');
        await submitCommand(page, 'cmd3');

        // cmd3 is already shown, so the first up-button reaches cmd2
        await page.click(HISTORY_UP_BUTTON);
        expect(await getInputValue(page)).toBe('cmd2');

        await page.click(HISTORY_UP_BUTTON);
        expect(await getInputValue(page)).toBe('cmd1');

        await page.click(HISTORY_DOWN_BUTTON);
        expect(await getInputValue(page)).toBe('cmd2');
    });

    // ── Empty history ────────────────────────────────────────────────

    test('should handle empty history gracefully', async ({page}) => {
        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('');

        await pressArrowDown(page);
        expect(await getInputValue(page)).toBe('');
    });

    // ── Typing resets history browsing ────────────────────────────────

    test('should reset history navigation when typing new input', async ({page}) => {
        await submitCommand(page, 'old1');
        await submitCommand(page, 'old2');

        // old2 is already shown, so the first ArrowUp reaches old1
        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('old1');

        // Start typing — resets history
        await page.locator(MESSAGE_INPUT).fill('new');

        // Press up — should do prefix search for "new"
        await pressArrowUp(page);
        // No commands start with 'new', so it should stay unchanged
        expect(await getInputValue(page)).toBe('new');
    });

    // ── Persistent history via localStorage ──────────────────────────

    test('should persist history across page reloads', async ({page}) => {
        await submitCommand(page, 'persisted1');
        await submitCommand(page, 'persisted2');

        // Reload page
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});
        await waitForCharacter(page, 'Tester');

        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('persisted2');

        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('persisted1');
    });

    // ── Multiline cursor checks ──────────────────────────────────────

    test('ArrowUp navigates history, does not move cursor in multiline textarea', async ({page}) => {
        await submitCommand(page, 'history1');

        const input = page.locator(MESSAGE_INPUT);
        await input.focus();
        await input.fill('');
        await input.type('line1');
        await input.press('Shift+Enter');
        await input.type('line2');

        // ArrowUp is intercepted (not moving cursor within textarea).
        // Since "line1\nline2" doesn't match any history prefix, content stays unchanged.
        await input.press('ArrowUp');
        const value = await getInputValue(page);
        expect(value).toContain('line1');
        expect(value).toContain('line2');
    });

    test('multiline input is stored as a single history entry', async ({page}) => {
        const input = page.locator(MESSAGE_INPUT);
        await input.focus();
        await input.type('first line');
        await input.press('Shift+Enter');
        await input.type('second line');
        await input.press('Enter');

        // Press up to retrieve — should get the full multiline entry
        await pressArrowUp(page);
        const value = await getInputValue(page);
        expect(value).toContain('first line');
        expect(value).toContain('second line');
    });
});

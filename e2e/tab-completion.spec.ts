import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    submitCommand,
    waitForCommandInput,
    pushGmcp,
    GMCP_PATHS,
} from './support/mocks';

const MESSAGE_INPUT = '#message-input';

async function getInputValue(page: Page): Promise<string> {
    return await page.locator(MESSAGE_INPUT).inputValue();
}

async function setInputValue(page: Page, value: string): Promise<void> {
    const input = page.locator(MESSAGE_INPUT);
    await input.focus();
    await input.fill(value);
}

async function pressTab(page: Page): Promise<void> {
    const input = page.locator(MESSAGE_INPUT);
    await input.focus();
    await input.press('Tab');
    await page.waitForTimeout(50);
}

test.describe('Tab completion', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        // Enable command history by sending GMCP char.info
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});
        await page.waitForTimeout(100);
    });

    test('Tab completes to matching command from history', async ({page}) => {
        await submitCommand(page, 'look north');
        await submitCommand(page, 'attack goblin');

        await setInputValue(page, 'loo');
        await pressTab(page);

        // First tab extends common prefix to "look" (longestCommonWord)
        const first = await getInputValue(page);
        expect(first.startsWith('look')).toBe(true);

        // Second tab cycles to the full match
        await pressTab(page);
        const second = await getInputValue(page);
        expect(second).toBe('look north');
    });

    test('Tab cycles to next match on repeated press', async ({page}) => {
        await submitCommand(page, 'look north');
        await submitCommand(page, 'look south');

        await setInputValue(page, 'look ');
        await pressTab(page);

        const first = await getInputValue(page);
        expect(first.startsWith('look ')).toBe(true);

        await pressTab(page);
        const second = await getInputValue(page);
        expect(second.startsWith('look ')).toBe(true);

        // The two cycled values should be different
        expect(first).not.toBe(second);
    });

    test('Shift+Tab cycles in reverse direction', async ({page}) => {
        await submitCommand(page, 'look north');
        await submitCommand(page, 'look south');
        await submitCommand(page, 'look east');

        // Tab forward from "look " to get the first match
        const input = page.locator(MESSAGE_INPUT);
        await input.focus();
        await input.fill('look ');

        await input.press('Tab');
        await page.waitForTimeout(50);
        const firstForward = await getInputValue(page);

        // Start fresh with Shift+Tab (backward)
        await input.fill('look ');
        await input.press('Shift+Tab');
        await page.waitForTimeout(50);
        const firstBackward = await getInputValue(page);

        // Forward and backward should start from different ends
        expect(firstForward.startsWith('look ')).toBe(true);
        expect(firstBackward.startsWith('look ')).toBe(true);
        expect(firstForward).not.toBe(firstBackward);
    });

    test('no matches leaves input unchanged', async ({page}) => {
        await submitCommand(page, 'attack goblin');

        await setInputValue(page, 'xyz');
        await pressTab(page);

        expect(await getInputValue(page)).toBe('xyz');
    });

    test('common prefix extension before cycling', async ({page}) => {
        await submitCommand(page, 'look north');
        await submitCommand(page, 'look south');

        await setInputValue(page, 'loo');
        await pressTab(page);

        const value = await getInputValue(page);
        // Both start with "look", so common prefix "look" should be extended first
        expect(value).toBe('look');
    });

    test('Tab state resets when typing a new character', async ({page}) => {
        await submitCommand(page, 'attack goblin');
        await submitCommand(page, 'look here');

        await setInputValue(page, 'att');
        await pressTab(page);

        const first = await getInputValue(page);
        expect(first.startsWith('att')).toBe(true);

        // Type a new value to reset tab state
        await setInputValue(page, 'loo');

        await pressTab(page);
        // Should now match "look here", not "attack" commands
        const value = await getInputValue(page);
        expect(value.startsWith('look')).toBe(true);
    });

    test('Tab cycles wrap around', async ({page}) => {
        await submitCommand(page, 'look north');
        await submitCommand(page, 'look south');

        await setInputValue(page, 'look ');

        // Press Tab enough times to cycle through all matches and wrap
        await pressTab(page);
        const first = await getInputValue(page);

        await pressTab(page);

        // After wrapping, we should be back to first match
        await pressTab(page);
        const third = await getInputValue(page);

        expect(third).toBe(first);
    });

    test('empty prefix matches all history entries', async ({page}) => {
        await submitCommand(page, 'north');
        await submitCommand(page, 'south');

        await setInputValue(page, '');
        await pressTab(page);

        const value = await getInputValue(page);
        // Should complete to something from history (most recent first)
        expect(value === 'south' || value === 'north').toBe(true);
    });
});

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
    // Wait for async selection handling
    await page.waitForTimeout(50);
}

async function pressArrowDown(page: Page): Promise<void> {
    const input = page.locator(MESSAGE_INPUT);
    await input.focus();
    await input.press('ArrowDown');
    // Wait for async selection handling
    await page.waitForTimeout(50);
}

test.describe('Command history traversal', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        // Trigger receivedFirstGmcp by sending char.info
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});
        await page.waitForTimeout(100);
    });

    test('should store commands in history when sent', async ({page}) => {
        await submitCommand(page, 'look');
        await submitCommand(page, 'north');
        await submitCommand(page, 'south');

        // Press up to get last command
        await pressArrowUp(page);
        expect(await getInputValue(page), 'should show most recent command').toBe('south');
    });

    test('should navigate up through history with ArrowUp', async ({page}) => {
        await submitCommand(page, 'command1');
        await submitCommand(page, 'command2');
        await submitCommand(page, 'command3');

        await pressArrowUp(page);
        expect(await getInputValue(page), 'first up should show command3').toBe('command3');

        await pressArrowUp(page);
        expect(await getInputValue(page), 'second up should show command2').toBe('command2');

        await pressArrowUp(page);
        expect(await getInputValue(page), 'third up should show command1').toBe('command1');

        // Should not go past first command
        await pressArrowUp(page);
        expect(await getInputValue(page), 'should stay at oldest command').toBe('command1');
    });

    test('should navigate down through history with ArrowDown', async ({page}) => {
        await submitCommand(page, 'first');
        await submitCommand(page, 'second');
        await submitCommand(page, 'third');

        // Navigate up to oldest command
        await pressArrowUp(page);
        await pressArrowUp(page);
        await pressArrowUp(page);
        expect(await getInputValue(page), 'should be at oldest').toBe('first');

        // Navigate back down
        await pressArrowDown(page);
        expect(await getInputValue(page), 'down should show second').toBe('second');

        await pressArrowDown(page);
        expect(await getInputValue(page), 'down should show third').toBe('third');
    });

    test('should return to original input when navigating down past most recent', async ({page}) => {
        await submitCommand(page, 'history1');
        await submitCommand(page, 'history2');

        const input = page.locator(MESSAGE_INPUT);

        // Keep focus on input for all operations
        await input.focus();
        await page.waitForTimeout(100);

        // Navigate up
        await input.press('ArrowUp');
        await page.waitForTimeout(100);
        expect(await getInputValue(page), 'up should show history2').toBe('history2');

        // Navigate up again
        await input.press('ArrowUp');
        await page.waitForTimeout(100);
        expect(await getInputValue(page), 'up should show history1').toBe('history1');

        // Navigate down
        await input.press('ArrowDown');
        await page.waitForTimeout(100);
        expect(await getInputValue(page), 'down should show history2').toBe('history2');

        // Navigate down again - should restore original empty input
        await input.press('ArrowDown');
        await page.waitForTimeout(100);
        expect(await getInputValue(page), 'down should restore original empty input').toBe('');
    });

    test('should filter history by prefix when input has text', async ({page}) => {
        await submitCommand(page, 'look north');
        await submitCommand(page, 'attack goblin');
        await submitCommand(page, 'look south');
        await submitCommand(page, 'examine sword');
        await submitCommand(page, 'look east');

        // Type prefix and press up
        await setInputValue(page, 'look');
        await pressArrowUp(page);
        expect(await getInputValue(page), 'first match should be look east').toBe('look east');

        await pressArrowUp(page);
        expect(await getInputValue(page), 'second match should be look south').toBe('look south');

        await pressArrowUp(page);
        expect(await getInputValue(page), 'third match should be look north').toBe('look north');
    });

    test('should not add duplicate consecutive commands to history', async ({page}) => {
        await submitCommand(page, 'look');
        await submitCommand(page, 'look');
        await submitCommand(page, 'look');
        await submitCommand(page, 'north');

        await pressArrowUp(page);
        expect(await getInputValue(page), 'first up should show north').toBe('north');

        await pressArrowUp(page);
        expect(await getInputValue(page), 'second up should show look (only one)').toBe('look');

        // Should be at the beginning of history
        await pressArrowUp(page);
        expect(await getInputValue(page), 'should stay at look').toBe('look');
    });

    test('should work with history buttons', async ({page}) => {
        await submitCommand(page, 'cmd1');
        await submitCommand(page, 'cmd2');
        await submitCommand(page, 'cmd3');

        // Click first up button
        await page.click(HISTORY_UP_BUTTON);
        await page.waitForTimeout(100);
        expect(await getInputValue(page), 'up button should show cmd3').toBe('cmd3');

        // Click second up button
        await page.click(HISTORY_UP_BUTTON);
        await page.waitForTimeout(100);
        expect(await getInputValue(page), 'up button should show cmd2').toBe('cmd2');

        await page.click(HISTORY_DOWN_BUTTON);
        await page.waitForTimeout(100);
        expect(await getInputValue(page), 'down button should show cmd3').toBe('cmd3');
    });

    test('should select entire text when navigating history', async ({page}) => {
        await submitCommand(page, 'test command');

        await pressArrowUp(page);

        // Check that text is selected
        const selection = await page.evaluate(() => {
            const input = document.querySelector<HTMLInputElement>('#message-input');
            if (!input) return null;
            return {
                start: input.selectionStart,
                end: input.selectionEnd,
                length: input.value.length,
            };
        });

        expect(selection, 'should have selection data').not.toBeNull();
        expect(selection?.start, 'selection should start at 0').toBe(0);
        expect(selection?.end, 'selection should end at text length').toBe(selection?.length);
    });

    test('should reset history navigation when typing new input', async ({page}) => {
        await submitCommand(page, 'old1');
        await submitCommand(page, 'old2');

        // Navigate to history
        await pressArrowUp(page);
        expect(await getInputValue(page)).toBe('old2');

        // Start typing - this should reset history navigation
        await page.locator(MESSAGE_INPUT).fill('new');

        // Press up - should start fresh search from history
        await pressArrowUp(page);
        // Since 'new' doesn't match any history, input should remain unchanged
        // or if there are matches, it should show them
        const value = await getInputValue(page);
        // No commands start with 'new', so it should stay as 'new'
        expect(value).toBe('new');
    });

    test('should not navigate history before receiving GMCP', async ({page}) => {
        // Create a fresh page without GMCP
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        // Don't send GMCP this time

        // Submit command directly (won't be added to history without GMCP)
        const input = page.locator(MESSAGE_INPUT);
        await input.fill('test');
        await input.press('Enter');
        await page.waitForTimeout(50);

        await input.fill('');
        await pressArrowUp(page);

        // Should remain empty since history is disabled before GMCP
        expect(await getInputValue(page), 'should be empty without GMCP').toBe('');
    });

    test('should handle empty history gracefully', async ({page}) => {
        // No commands submitted yet
        await pressArrowUp(page);
        expect(await getInputValue(page), 'should remain empty').toBe('');

        await pressArrowDown(page);
        expect(await getInputValue(page), 'should remain empty').toBe('');
    });

    test('should preserve and restore current input across history navigation', async ({page}) => {
        // Submit commands that start with common prefix
        await submitCommand(page, 'my command 1');
        await submitCommand(page, 'my command 2');

        // Type a matching prefix
        await setInputValue(page, 'my');

        // Go up to history - should filter by 'my' prefix
        await pressArrowUp(page);
        expect(await getInputValue(page), 'should show matching history').toBe('my command 2');

        // Go back down - should restore our prefix
        await pressArrowDown(page);
        expect(await getInputValue(page), 'should restore original prefix').toBe('my');
    });
});

import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, getCommandLog, pushText, resetCommandLog, submitCommand, waitForCommandInput} from './support/mocks';

const MESSAGE_INPUT = '#message-input';
const OUTPUT_SEARCH = '#output-search-input';

async function highlightSizes(page: Page): Promise<{ all: number; current: number }> {
    return await page.evaluate(() => {
        const registry = (CSS as any).highlights;
        return {
            all: registry.get('output-search')?.size ?? 0,
            current: registry.get('output-search-current')?.size ?? 0,
        };
    });
}

test.describe('Ctrl+F: search in the game output', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushText(page, 'Widzisz tu goblina.\n');
        await pushText(page, 'Nic ciekawego.\n');
        await pushText(page, 'Goblin stoi przy drzwiach.\n');
        await expect(page.locator('#main_text_output_msg_wrapper')).toContainText('Goblin stoi przy');
    });

    test('opens from the command line, highlights hits and walks them', async ({page}) => {
        await page.locator(MESSAGE_INPUT).focus();
        await page.keyboard.press('Control+f');

        const input = page.locator(OUTPUT_SEARCH);
        await expect(input).toBeFocused();
        await input.fill('GOBLIN');

        const count = page.locator('.output-search__count');
        await expect(count).toHaveText('2 z 2');
        expect(await highlightSizes(page)).toEqual({all: 2, current: 1});

        await input.press('Enter');
        await expect(count).toHaveText('1 z 2');
        await input.press('Shift+Enter');
        await expect(count).toHaveText('2 z 2');

        await input.fill('smok');
        await expect(count).toHaveText('brak');
    });

    test('keeps counting as new output arrives', async ({page}) => {
        await page.locator(MESSAGE_INPUT).focus();
        await page.keyboard.press('Control+f');
        await page.locator(OUTPUT_SEARCH).fill('goblin');
        await expect(page.locator('.output-search__count')).toHaveText('2 z 2');

        await pushText(page, 'Kolejny goblin nadchodzi.\n');
        await expect(page.locator('.output-search__count')).toHaveText('2 z 3');
    });

    test('Escape closes it, clears the highlights and returns to the command line', async ({page}) => {
        await page.locator(MESSAGE_INPUT).focus();
        await page.keyboard.press('Control+f');
        await page.locator(OUTPUT_SEARCH).fill('goblin');
        await page.locator(OUTPUT_SEARCH).press('Escape');

        await expect(page.locator('.output-search')).toHaveCount(0);
        await expect(page.locator(MESSAGE_INPUT)).toBeFocused();
        expect(await highlightSizes(page)).toEqual({all: 0, current: 0});
    });
});

test.describe('Ctrl+R: search in the command history', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        for (const command of ['zabij goblina', 'kup chleb', 'zabij orka', 'polnoc']) {
            await submitCommand(page, command);
        }
    });

    test('filters newest first and puts the pick on the line without sending', async ({page}) => {
        const commandInput = page.locator(MESSAGE_INPUT);
        await commandInput.fill('');
        await commandInput.press('Control+r');

        const search = page.locator('.history-search input');
        await expect(search).toBeFocused();
        await search.fill('zab');

        const items = page.locator('.history-search__list li');
        // Oldest at the top, newest right above the command line and selected.
        await expect(items).toHaveText(['zabij goblina', 'zabij orka']);
        await expect(page.locator('.history-search__list li.is-selected')).toHaveText('zabij orka');

        await search.press('ArrowUp');
        await expect(page.locator('.history-search__list li.is-selected')).toHaveText('zabij goblina');
        await resetCommandLog(page);
        await search.press('Enter');

        await expect(page.locator('.history-search')).toHaveCount(0);
        await expect(commandInput).toBeFocused();
        await expect(commandInput).toHaveValue('zabij goblina');
        const caret = await commandInput.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]);
        expect(await getCommandLog(page)).toEqual([]);
        expect(caret).toEqual([13, 13]);
    });

    test('Escape leaves the command line as it was', async ({page}) => {
        const commandInput = page.locator(MESSAGE_INPUT);
        await commandInput.fill('kup');
        await commandInput.press('Control+r');

        const search = page.locator('.history-search input');
        await expect(search).toHaveValue('kup');
        await expect(page.locator('.history-search__list li')).toHaveText(['kup chleb']);
        await search.press('Escape');

        await expect(page.locator('.history-search')).toHaveCount(0);
        await expect(commandInput).toHaveValue('kup');
    });
});

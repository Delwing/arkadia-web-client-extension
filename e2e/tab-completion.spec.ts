import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    waitForCommandInput,
    waitForCharacter,
    pushGmcp,
    pushText,
    waitForOutputContaining,
    GMCP_PATHS,
} from './support/mocks';

const SUGGESTION_PLUGIN_URL = 'https://example.com/suggestion-plugin.js';

function makeSuggestionPlugin(words: string[]): string {
    const wordsStr = words.map(w => `'${w}'`).join(', ');
    return `export async function init(api) {
    api.command.addSuggestions(${wordsStr});
    return { name: 'Suggestion Plugin', version: '1.0.0' };
}`;
}

async function loadSuggestionPlugin(page: Page, words: string[]): Promise<void> {
    const body = makeSuggestionPlugin(words);
    await page.route(`${SUGGESTION_PLUGIN_URL}**`, async (route) => {
        await route.fulfill({status: 200, contentType: 'application/javascript', body});
    });

    await page.click('#menu-button');
    await page.click('#scripts-button');
    const modal = page.locator('#scripts-modal');
    await expect(modal).toBeVisible();

    const input = modal.getByPlaceholder('URL skryptu');
    const addBtn = modal.getByRole('button', {name: 'Dodaj'});
    await input.fill(SUGGESTION_PLUGIN_URL);
    await addBtn.click();
    await expect(modal.getByText('Suggestion Plugin')).toBeVisible();

    await modal.locator('.btn-close').first().click();
    await expect(modal).not.toBeVisible();
}

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
}

async function pressShiftTab(page: Page): Promise<void> {
    const input = page.locator(MESSAGE_INPUT);
    await input.focus();
    await input.press('Shift+Tab');
}

test.describe('Tab completion — output buffer based', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});
        await waitForCharacter(page, 'Tester');
    });

    test('Tab completes last word from output text', async ({page}) => {
        // Push text to output buffer
        await pushText(page, 'Widzisz tutaj poteznego wojownika i mlodego druida.\n');
        await waitForOutputContaining(page, 'poteznego');

        await setInputValue(page, 'zabij pote');
        await pressTab(page);

        const value = await getInputValue(page);
        expect(value).toBe('zabij poteznego');
    });

    test('Tab cycles through multiple matches', async ({page}) => {
        await pushText(page, 'Na polce stoi wielka ksiazka i wielki miecz.\n');
        await waitForOutputContaining(page, 'wielki');

        await setInputValue(page, 'wiel');
        await pressTab(page);
        const first = await getInputValue(page);

        await pressTab(page);
        const second = await getInputValue(page);

        // Both should start with "wiel" and be different
        expect(first.startsWith('wiel')).toBe(true);
        expect(second.startsWith('wiel')).toBe(true);
        expect(first).not.toBe(second);
    });

    test('Shift+Tab cycles backward', async ({page}) => {
        await pushText(page, 'Siedziba alpha beta gamma.\n');
        await waitForOutputContaining(page, 'Siedziba');

        await setInputValue(page, 'Siedzi');
        // Tab forward
        await pressTab(page);
        const forward = await getInputValue(page);
        expect(forward.toLowerCase().startsWith('siedzi')).toBe(true);

        // Reset and try Shift+Tab
        await setInputValue(page, 'Siedzi');
        await pressShiftTab(page);
        const backward = await getInputValue(page);
        expect(backward.toLowerCase().startsWith('siedzi')).toBe(true);
    });

    test('case-insensitive matching', async ({page}) => {
        await pushText(page, 'Widzisz tutaj poteznego wojownika.\n');
        await waitForOutputContaining(page, 'poteznego');

        // Type with uppercase prefix — should match lowercase "poteznego" from output
        await setInputValue(page, 'zabij Pote');
        await pressTab(page);

        const value = await getInputValue(page);
        // Should match "poteznego" case-insensitively despite typing "Pote"
        expect(value.startsWith('zabij ')).toBe(true);
        expect(value.toLowerCase()).toContain('potezn');
    });

    test('no matches leaves input unchanged', async ({page}) => {
        await pushText(page, 'zwykly tekst\n');
        await waitForOutputContaining(page, 'zwykly');

        await setInputValue(page, 'xyzxyz');
        await pressTab(page);

        expect(await getInputValue(page)).toBe('xyzxyz');
    });

    test('Tab state resets when typing a new character', async ({page}) => {
        await pushText(page, 'wojownik i druid stoja obok.\n');
        await waitForOutputContaining(page, 'wojownik');

        await setInputValue(page, 'woj');
        await pressTab(page);
        const first = await getInputValue(page);
        expect(first.toLowerCase().startsWith('woj')).toBe(true);

        // Type a new value — resets tab state
        await setInputValue(page, 'dru');
        await pressTab(page);
        const value = await getInputValue(page);
        expect(value.toLowerCase().startsWith('dru')).toBe(true);
    });

    test('Tab wraps around matches', async ({page}) => {
        await pushText(page, 'raz dwa trzy raz_b raz_c\n');
        await waitForOutputContaining(page, 'raz_c');

        await setInputValue(page, 'ra');
        // Cycle through all matches
        await pressTab(page);
        const first = await getInputValue(page);

        await pressTab(page);
        await pressTab(page);

        // After wrapping we should be back to first
        const wrapped = await getInputValue(page);
        expect(wrapped).toBe(first);
    });

    test('plugin suggestions appear before output words', async ({page}) => {
        // Push output with a matching word
        await pushText(page, 'Widzisz tutaj poteznego wojownika.\n');
        await waitForOutputContaining(page, 'poteznego');

        // Load a minimal plugin that registers a suggestion via the plugin API
        await loadSuggestionPlugin(page, ['potwornego']);

        await setInputValue(page, 'pot');
        await pressTab(page);
        const first = await getInputValue(page);

        await pressTab(page);
        const second = await getInputValue(page);

        // Plugin suggestion should come first
        expect(first).toBe('potwornego');
        expect(second).toBe('poteznego');
    });

    test('newer output lines are suggested before older ones', async ({page}) => {
        await pushText(page, 'Widzisz starego maga.\n');
        await waitForOutputContaining(page, 'starego');
        await pushText(page, 'Widzisz stalowego golema.\n');
        await waitForOutputContaining(page, 'stalowego');

        await setInputValue(page, 'sta');
        await pressTab(page);
        const first = await getInputValue(page);

        await pressTab(page);
        const second = await getInputValue(page);

        // Newer line ("stalowego") should come before older ("starego")
        expect(first).toBe('stalowego');
        expect(second).toBe('starego');
    });

    test('only completes the last word, preserving prefix', async ({page}) => {
        await pushText(page, 'Widzisz tutaj poteznego wojownika.\n');
        await waitForOutputContaining(page, 'poteznego');

        await setInputValue(page, 'zabij pote');
        await pressTab(page);

        const value = await getInputValue(page);
        // Should only replace the last word "pote" with a match, keeping "zabij "
        expect(value.startsWith('zabij ')).toBe(true);
    });
});

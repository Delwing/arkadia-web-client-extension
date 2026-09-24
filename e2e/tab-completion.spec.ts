import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {openSettings, saveSettings} from './support/settings';
import {
    ensureGameSocket,
    waitForCommandInput,
    waitForCharacter,
    pushGmcp,
    pushText,
    waitForOutputContaining,
    submitCommand,
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

    // "Dodaj plugin" opens a chooser; the URL field lives behind its "Z adresu URL" route.
    await modal.getByRole('button', {name: 'Dodaj plugin'}).click();
    await page.locator('.plugin-route', {hasText: 'Z adresu URL'}).click();

    const dialog = page.locator('.popup-dialog', {hasText: 'Dodaj skrypt z URL'}).last();
    await dialog.getByPlaceholder('URL skryptu').fill(SUGGESTION_PLUGIN_URL);
    await dialog.getByRole('button', {name: 'Dodaj', exact: true}).click();
    await expect(modal.getByText('Suggestion Plugin')).toBeVisible();

    await modal.locator('.app-modal__close').first().click();
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

test.describe('Tab completion — command history', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('Tab finishes a command already sent, before words from the output', async ({page}) => {
        await pushText(page, 'Widzisz tutaj zabawke i zabytek.\n');
        await waitForOutputContaining(page, 'zabawke');
        await submitCommand(page, 'zabij ob_12345');

        await setInputValue(page, 'zab');
        await pressTab(page);
        expect(await getInputValue(page), 'the whole command from history first').toBe('zabij ob_12345');

        await pressTab(page);
        expect(await getInputValue(page), 'then words from the output').not.toBe('zabij ob_12345');
    });

    test('Tab completes a command past a space, where no word is being typed', async ({page}) => {
        await submitCommand(page, 'wejdz na statek');

        await setInputValue(page, 'wejdz na ');
        await pressTab(page);
        expect(await getInputValue(page)).toBe('wejdz na statek');
    });
});

test.describe('Tab completion hint', () => {
    test('shows what Tab would complete after the caret, and Tab takes it', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushText(page, 'Przy najdalszym pomoscie cumuje szeroki statek handlowy.');

        await page.click('#message-input');
        await page.keyboard.type('wejdz na st');
        await expect(page.locator('.command-field__ghost-rest'), 'the rest of the word, dimmed').toHaveText('atek');
        await expect(page.locator('.command-field__tab-hint')).toBeVisible();
        await expect(page.locator('#message-input'), 'the hint is not typed into the line').toHaveValue('wejdz na st');

        // Typing along the hinted word keeps the hint on screen, one letter shorter.
        await page.keyboard.type('a');
        const rest = await page.locator('.command-field__ghost-rest').textContent({timeout: 50});
        expect(rest, 'no blink while typing along the hint').toBe('tek');

        await page.keyboard.press('Tab');
        await expect(page.locator('#message-input')).toHaveValue('wejdz na statek');
        await expect(page.locator('.command-field__ghost'), 'nothing more to hint mid-cycle').toHaveCount(0);
    });
});

test.describe('Tab completion hint setting', () => {
    test('switched off, no hint is shown but Tab still completes', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openSettings(page, 'ui-commands');
        await modal.locator('#ui-tab-completion-hint').uncheck();
        await saveSettings(page);

        await pushText(page, 'Przy najdalszym pomoscie cumuje szeroki statek handlowy.');
        await page.fill('#message-input', 'wejdz na st');
        await page.focus('#message-input');
        // Longer than the hint's own delay.
        await page.waitForTimeout(400);
        await expect(page.locator('.command-field__ghost')).toHaveCount(0);
        await expect(page.locator('.command-field__tab-hint')).toHaveCount(0);

        await page.keyboard.press('Tab');
        await expect(page.locator('#message-input')).toHaveValue('wejdz na statek');
    });
});

test.describe('Tab completion modes', () => {
    async function chooseMode(page: Page, mode: 'word' | 'whole'): Promise<void> {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        const modal = await openSettings(page, 'ui-commands');
        await modal.locator(`#ui-tab-completion-mode input[value="${mode}"]`).check();
        await saveSettings(page);
        await submitCommand(page, 'zabij duzego smoka');
        await page.fill('#message-input', '');
        await page.keyboard.type('zab');
        await expect(page.locator('.command-field__ghost-rest')).toHaveText('ij duzego smoka');
    }

    test('word mode: Tab takes one word, the right arrow the rest', async ({page}) => {
        await chooseMode(page, 'word');
        await expect(page.locator('.command-field__tab-hint')).toContainText('słowo');

        await page.keyboard.press('Tab');
        await expect(page.locator('#message-input')).toHaveValue('zabij ');
        await expect(page.locator('.command-field__ghost-rest')).toHaveText('duzego smoka');

        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#message-input')).toHaveValue('zabij duzego smoka');
    });

    test('whole mode: Ctrl+right arrow takes one word, Tab the rest', async ({page}) => {
        await chooseMode(page, 'whole');

        await page.keyboard.press('Control+ArrowRight');
        await expect(page.locator('#message-input')).toHaveValue('zabij ');

        await page.keyboard.press('Tab');
        await expect(page.locator('#message-input')).toHaveValue('zabij duzego smoka');
    });

    test('the right arrow still moves the caret inside the line', async ({page}) => {
        await chooseMode(page, 'word');
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#message-input'), 'caret back at the end, nothing taken').toHaveValue('zab');
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#message-input')).toHaveValue('zabij duzego smoka');
    });
});

test.describe('Command line on a phone', () => {
    test.use({hasTouch: true, isMobile: true, viewport: {width: 390, height: 800}});

    test('no prompt, a tap on the hint completes, and a long line slides instead of wrapping', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushText(page, 'Przy najdalszym pomoscie cumuje szeroki statek handlowy.');

        await expect(page.locator('.command-field__prompt')).toBeHidden();

        await page.focus('#message-input');
        await page.keyboard.type('wejdz na st');
        await expect(page.locator('.command-field__ghost-rest')).toHaveText('atek');
        await expect(page.locator('.command-field__tab-hint'), 'no Tab key to point at').toBeHidden();

        await page.locator('.command-field__ghost-rest').tap();
        await expect(page.locator('#message-input')).toHaveValue('wejdz na statek');
        await expect(page.locator('#message-input'), 'the tap left the caret in the field').toBeFocused();

        const input = page.locator('#message-input');
        const oneLine = await input.evaluate((el) => el.getBoundingClientRect().height);
        await page.keyboard.type(' i jeszcze bardzo dluga komenda ktora nie miesci sie w polu wcale');
        const box = await input.evaluate((el) => ({
            height: el.getBoundingClientRect().height,
            overflows: el.scrollWidth > el.clientWidth,
        }));
        expect(box.overflows, 'the line is wider than the field').toBe(true);
        expect(box.height, 'but the field stays one line tall').toBe(oneLine);
    });
});

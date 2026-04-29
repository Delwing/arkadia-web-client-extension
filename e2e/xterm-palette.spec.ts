import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, pushText, waitForCommandInput, waitForOutputContaining} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const UI_SETTINGS_BUTTON = '#ui-settings-button';
const UI_MODAL = '#ui-settings-modal';
const SAVE_BUTTON = '#ui-settings-save';

async function openUiSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(UI_SETTINGS_BUTTON);
    const modal = page.locator(UI_MODAL);
    await expect(modal, 'should open UI settings modal').toBeVisible();
    return modal;
}

async function setPalette(page: Page, palette: 'arkadia' | 'proper') {
    const modal = await openUiSettings(page);
    await modal.locator('#ui-xterm-palette').selectOption(palette);
    await page.click(SAVE_BUTTON);
    await expect(modal, 'should close modal after saving').not.toBeVisible();
}

test.describe('Xterm palette switching', () => {
    test('palette select has both options available', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openUiSettings(page);
        const select = modal.locator('#ui-xterm-palette');

        // Get all options
        const options = await select.locator('option').allTextContents();

        // Should have at least 2 options (Arkadia and XTerm/proper)
        expect(options.length, 'Palette select has multiple options').toBeGreaterThanOrEqual(2);

        // Verify we can find references to both palettes
        const optionValues = await select.locator('option').evaluateAll(opts =>
            opts.map(opt => (opt as HTMLOptionElement).value)
        );

        expect(optionValues, 'Has Arkadia palette option').toContain('arkadia');
        expect(optionValues, 'Has proper/XTerm palette option').toContain('proper');

        await page.click(SAVE_BUTTON);
    });

    test('palette selection UI reflects current setting', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Open UI settings
        let modal = await openUiSettings(page);

        // Default should be Arkadia
        let selected = await modal.locator('#ui-xterm-palette').inputValue();
        expect(selected, 'Default palette is Arkadia').toBe('arkadia');

        await page.click(SAVE_BUTTON);

        // Switch to proper
        await setPalette(page, 'proper');

        // Reopen settings and verify proper is selected
        modal = await openUiSettings(page);
        selected = await modal.locator('#ui-xterm-palette').inputValue();
        expect(selected, 'Proper palette is selected in UI').toBe('proper');

        await page.click(SAVE_BUTTON);

        // Clean up
        await setPalette(page, 'arkadia');
    });

    test('changing palette updates localStorage', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Change to proper
        await setPalette(page, 'proper');

        // Check localStorage was updated
        const stored = await page.evaluate(() => localStorage.getItem('uiSettings'));
        expect(stored, 'localStorage should contain settings').not.toBeNull();
        expect(stored, 'localStorage should contain proper palette').toContain('proper');

        // Change back to arkadia
        await setPalette(page, 'arkadia');

        const storedAfter = await page.evaluate(() => localStorage.getItem('uiSettings'));
        expect(storedAfter, 'localStorage should contain arkadia palette').toContain('arkadia');
    });

    test('palette options have descriptive labels', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openUiSettings(page);
        const select = modal.locator('#ui-xterm-palette');

        // Get option labels
        const labels = await select.locator('option').allTextContents();

        // Labels should not be empty
        labels.forEach(label => {
            expect(label.trim().length, 'Option label should not be empty').toBeGreaterThan(0);
        });

        await page.click(SAVE_BUTTON);
    });

    test('same xterm color index renders different colors in different palettes', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Ensure we're using arkadia palette (default)
        await setPalette(page, 'arkadia');

        // Send text with xterm extended color code (ESC[38;5;1m) - palette index 1
        // This uses the xterm palette (not the fixed ANSI colors)
        // Arkadia index 1 (palette index 0 in xterm is index 0, palette index 1 is index 0 in the array after offset +1)
        // Wait, xterm indices are 1-based in the escape code, so index 1 means colorCodes.xterm[1-1] = colorCodes.xterm[0]
        // Arkadia index 0: #bb0000 = rgb(187, 0, 0) - red
        await pushText(page, '\x1b[38;5;16mArkadia Color 16\x1b[0m');

        // Wait for text to appear
        await expect(output, 'should display colored text in arkadia').toContainText('Arkadia Color 16');

        // Check the color of the rendered text in arkadia palette
        const arkadiaColoredText = output.locator('span').filter({hasText: 'Arkadia Color 16'}).last();
        const arkadiaColor = await arkadiaColoredText.evaluate(el => {
            return window.getComputedStyle(el).color;
        });

        // Now switch to proper palette
        await setPalette(page, 'proper');

        // Send same xterm color index
        // Proper index 0: #000000 = rgb(0, 0, 0) - black
        await pushText(page, '\x1b[38;5;16mProper Color 16\x1b[0m');

        await waitForOutputContaining(page, 'Proper Color 16');

        // Check the color of the rendered text in proper palette
        const properColoredText = output.locator('span').filter({hasText: 'Proper Color 16'}).last();
        const properColor = await properColoredText.evaluate(el => {
            return window.getComputedStyle(el).color;
        });

        // Verify the colors are different
        expect(arkadiaColor, `Arkadia (${arkadiaColor}) and proper (${properColor}) should render same index with different colors`).not.toBe(properColor);

        // Verify the specific colors match the palette definitions
        // Arkadia palette index 16: #ffffff = rgb(255, 255, 255)
        expect(arkadiaColor, 'Arkadia xterm color 16 should be rgb(255, 255, 255)').toBe('rgb(255, 255, 255)');
        // Proper palette index 16: #000000 = rgb(0, 0, 0)
        expect(properColor, 'Proper xterm color 16 should be rgb(0, 0, 0)').toBe('rgb(0, 0, 0)');

        // Clean up
        await setPalette(page, 'arkadia');
    });

    test('palette switch toggles between arkadia and proper', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Get initial setting
        let modal = await openUiSettings(page);
        const initialValue = await modal.locator('#ui-xterm-palette').inputValue();
        await page.click(SAVE_BUTTON);

        // Switch to the other palette
        const otherPalette = initialValue === 'arkadia' ? 'proper' : 'arkadia';
        await setPalette(page, otherPalette);

        // Verify it changed
        modal = await openUiSettings(page);
        const newValue = await modal.locator('#ui-xterm-palette').inputValue();
        expect(newValue, 'Palette switched to other option').toBe(otherPalette);
        await page.click(SAVE_BUTTON);

        // Switch back
        await setPalette(page, initialValue as 'arkadia' | 'proper');

        // Verify it switched back
        modal = await openUiSettings(page);
        const finalValue = await modal.locator('#ui-xterm-palette').inputValue();
        expect(finalValue, 'Palette switched back to original').toBe(initialValue);
        await page.click(SAVE_BUTTON);
    });
});

import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, installEmbeddedMock, waitForClientReady} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const MOBILE_BUTTONS_BUTTON = '#mobile-buttons-button';
const MOBILE_BUTTONS_MODAL = '#mobile-buttons-modal';
const MOBILE_BUTTONS_SAVE = '#mobile-buttons-save';

async function openMobileButtonsSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(MOBILE_BUTTONS_BUTTON);
    const modal = page.locator(MOBILE_BUTTONS_MODAL);
    await expect(modal, 'should open mobile buttons settings modal').toBeVisible();
    return modal;
}

test.beforeEach(async ({context}) => {
    await installEmbeddedMock(context);
});

test.describe('Mobile button color and command configuration', () => {
    test('change button color and command, verify persistence', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        // Open mobile buttons settings modal
        const modal = await openMobileButtonsSettings(page);

        // Click on a command button to configure it (using button-2 which has a command macro)
        const configButton = modal.locator('#button-2');
        await expect(configButton, 'should find button-2 to configure').toBeVisible();
        await configButton.click();

        // Wait for the configuration panel to appear
        const configPanel = modal.locator('.mobile-button-config');
        await expect(configPanel, 'should show configuration panel').toBeVisible();

        // Verify it's a command type button
        const macroSelect = configPanel.locator('.mobile-button-macro');
        await expect(macroSelect, 'should have command macro selected').toHaveValue('command');

        // Change the button color to a distinctive color
        const newColor = '#ff5733'; // A distinctive orange-red color
        const colorInput = configPanel.locator('.mobile-button-color').first();
        await expect(colorInput, 'should find color input').toBeVisible();
        await colorInput.fill(newColor);

        // Change the command text
        const newCommand = 'test command';
        const commandInput = configPanel.locator('.mobile-button-command');
        await expect(commandInput, 'should find command textarea').toBeVisible();
        await commandInput.fill(newCommand);

        // Save the settings
        const saveButton = modal.locator(MOBILE_BUTTONS_SAVE);
        await saveButton.click();

        // Wait for modal to close
        await expect(modal, 'should close mobile buttons modal after saving').not.toBeVisible();

        // Verify the settings were saved to localStorage
        const savedSettings = await page.evaluate(() => {
            const raw = window.localStorage.getItem('mobileButtonSettings');
            return raw ? JSON.parse(raw) : null;
        });

        expect(savedSettings, 'should save settings to localStorage').not.toBeNull();
        expect(
            savedSettings.mobileButtonSettings?.solo?.buttons?.['button-2']?.color,
            'should persist button color in localStorage'
        ).toBe(newColor);
        expect(
            savedSettings.mobileButtonSettings?.solo?.buttons?.['button-2']?.command,
            'should persist button command in localStorage'
        ).toBe(newCommand);

        // Verify the button color is applied in the DOM
        // The buttons are rendered in #mobile-direction-buttons container
        const buttonInDom = page.locator('#mobile-direction-buttons #button-2');
        await expect(buttonInDom, 'should find button in mobile buttons container').toBeVisible();

        const appliedColor = await buttonInDom.evaluate((el: HTMLElement) => {
            return el.style.backgroundColor;
        });

        // Convert hex to rgb for comparison (browsers return rgb format)
        const expectedRgb = 'rgb(255, 87, 51)'; // #ff5733 in rgb
        expect(appliedColor, 'should apply new color to button in DOM').toBe(expectedRgb);

        // Reload the page to test persistence
        await page.reload();
        await waitForClientReady(page);
        await ensureGameSocket(page);

        // Verify settings persisted after reload
        const reloadedSettings = await page.evaluate(() => {
            const raw = window.localStorage.getItem('mobileButtonSettings');
            return raw ? JSON.parse(raw) : null;
        });

        expect(
            reloadedSettings.mobileButtonSettings?.solo?.buttons?.['button-2']?.color,
            'should persist button color after reload'
        ).toBe(newColor);
        expect(
            reloadedSettings.mobileButtonSettings?.solo?.buttons?.['button-2']?.command,
            'should persist button command after reload'
        ).toBe(newCommand);

        // Verify the button color is still applied in the DOM after reload
        const reloadedButton = page.locator('#mobile-direction-buttons #button-2');
        await expect(reloadedButton, 'should find button after reload').toBeVisible();

        const reloadedColor = await reloadedButton.evaluate((el: HTMLElement) => {
            return el.style.backgroundColor;
        });

        expect(reloadedColor, 'should maintain color after reload').toBe(expectedRgb);

        // Open settings again to verify the UI shows the saved values
        const reopenedModal = await openMobileButtonsSettings(page);

        // Click on the same button to see its configuration
        const reopenedConfigButton = reopenedModal.locator('#button-2');
        await reopenedConfigButton.click();

        const reopenedConfigPanel = reopenedModal.locator('.mobile-button-config');
        await expect(reopenedConfigPanel, 'should show configuration panel again').toBeVisible();

        // Verify the color input shows the saved color
        const savedColorInput = reopenedConfigPanel.locator('.mobile-button-color').first();
        await expect(
            savedColorInput,
            'should show saved color in UI'
        ).toHaveValue(newColor);

        // Verify the command input shows the saved command
        const savedCommandInput = reopenedConfigPanel.locator('.mobile-button-command');
        await expect(
            savedCommandInput,
            'should show saved command in UI'
        ).toHaveValue(newCommand);
    });
});

import { expect, test } from './support/fixtures';
import { ensureGameSocket, getLastOutgoingCommand, waitForCommandInput } from './support/mocks';
import {Page} from "@playwright/test";

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


test.describe('Mobile buttons color and command configuration', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
    });

    test('should display mobile buttons modal and configure button colors', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Open mobile buttons settings modal
        const modal = await openMobileButtonsSettings(page);
        await expect(modal, 'mobile buttons modal should be visible').toBeVisible();

        // Check that the modal body container is visible
        const modalBody = modal.locator('.modal-body');
        await expect(modalBody, 'modal body should be visible').toBeVisible();

        // Check that the mobile-buttons-options container exists
        const optionsContainer = page.locator('#mobile-buttons-options');
        await expect(optionsContainer, 'mobile buttons options container should be visible').toBeVisible();

        // Get the current visible preview grid (solo mode by default)
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await expect(soloPreview, 'solo preview grid should be visible').toBeVisible();

        // Wait for buttons to be rendered in the visible grid
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        // Check that specific buttons are visible in the current tab
        const button1 = soloPreview.locator('[data-button-id="button-1"]');
        await expect(button1, 'button-1 should be visible').toBeVisible();

        const button2 = soloPreview.locator('[data-button-id="button-2"]');
        await expect(button2, 'button-2 should be visible').toBeVisible();

        const button3 = soloPreview.locator('[data-button-id="button-3"]');
        await expect(button3, 'button-3 should be visible').toBeVisible();

        // Click on button-2 to open its configuration
        await button2.click();

        // Wait for the configuration panel to appear
        const configPanel = page.locator('.mobile-button-config');
        await expect(configPanel, 'configuration panel should be visible').toBeVisible();

        // Check that macro select is visible
        const macroSelect = configPanel.locator('.mobile-button-macro');
        await expect(macroSelect, 'macro select should be visible').toBeVisible();

        // Check that label input is visible
        const labelInput = configPanel.locator('.mobile-button-label');
        await expect(labelInput, 'label input should be visible').toBeVisible();

        // Check that color input is visible (in the "Wyglad" section)
        const colorRow = configPanel.locator('.mobile-button-color-row').first();
        await expect(colorRow, 'color row should be visible').toBeVisible();
        const colorInput = colorRow.locator('input[type="color"]');
        await expect(colorInput, 'color input should be visible').toBeVisible();

        // Change the button color
        await colorInput.fill('#ff0000');

        // Verify the button color changed in the preview
        const buttonStyle = await button2.evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
        });
        // RGB value of #ff0000 is rgb(255, 0, 0)
        expect(buttonStyle, 'button background color should be red in preview').toBe('rgb(255, 0, 0)');

        // Change the macro type to "command"
        await macroSelect.selectOption('command');

        // Wait for command textarea to appear
        const commandInput = configPanel.locator('textarea');
        await expect(commandInput, 'command input should be visible').toBeVisible();

        // Set a command
        await commandInput.fill('test command');

        // Set a label
        await labelInput.fill('Test Button');

        // Verify the label changed in the preview
        const buttonText = await button2.textContent();
        expect(buttonText, 'button label should be updated in preview').toBe('Test Button');

        // Close the config panel first
        const closeConfigButton = configPanel.locator('.btn-close');
        await closeConfigButton.click();
        await expect(configPanel, 'config panel should close').not.toBeVisible();

        // Save the configuration
        const saveButton = page.locator(MOBILE_BUTTONS_SAVE);
        await expect(saveButton, 'save button should be visible').toBeVisible();
        await saveButton.click();

        // Verify the modal closes
        await expect(modal, 'modal should be hidden after save').not.toBeVisible({ timeout: 5000 });

        // Verify the actual mobile button (outside the modal) has the correct color and label
        const actualMobileButtons = page.locator('#mobile-direction-buttons');
        await expect(actualMobileButtons, 'mobile buttons container should be visible').toBeVisible();

        const actualButton2 = actualMobileButtons.locator('#button-2');
        await expect(actualButton2, 'actual button-2 should be visible').toBeVisible();

        // Verify the actual button has the correct label
        const actualButtonText = await actualButton2.textContent();
        expect(actualButtonText, 'actual button label should be Test Button').toBe('Test Button');

        // Verify the actual button has the correct color
        const actualButtonStyle = await actualButton2.evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
        });
        expect(actualButtonStyle, 'actual button background color should be red').toBe('rgb(255, 0, 0)');

        // Reload the page to verify persistence
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Verify the actual mobile button still has the correct configuration after reload
        const actualMobileButtonsAfterReload = page.locator('#mobile-direction-buttons');
        await expect(actualMobileButtonsAfterReload, 'mobile buttons container should be visible after reload').toBeVisible();

        const actualButton2AfterReload = actualMobileButtonsAfterReload.locator('#button-2');
        await expect(actualButton2AfterReload, 'actual button-2 should be visible after reload').toBeVisible();

        // Verify the label is still correct after reload
        const actualButtonTextAfterReload = await actualButton2AfterReload.textContent();
        expect(actualButtonTextAfterReload, 'actual button label should still be Test Button after reload').toBe('Test Button');

        // Verify the color is still correct after reload
        const actualButtonStyleAfterReload = await actualButton2AfterReload.evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
        });
        expect(actualButtonStyleAfterReload, 'actual button background color should still be red after reload').toBe('rgb(255, 0, 0)');

        // Open the modal again to verify the configuration is persisted
        const modalAfterReload = await openMobileButtonsSettings(page);
        await expect(modalAfterReload, 'mobile buttons modal should be visible after reload').toBeVisible();

        const soloPreviewAfterReload = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await expect(soloPreviewAfterReload, 'solo preview grid should be visible after reload').toBeVisible();

        const button2AfterReload = soloPreviewAfterReload.locator('[data-button-id="button-2"]');
        await button2AfterReload.click();

        // Wait for the configuration panel to appear
        const configPanelAfterReload = page.locator('.mobile-button-config');
        await expect(configPanelAfterReload, 'configuration panel should be visible after reload').toBeVisible();

        // Verify the macro is still set to "command"
        const macroSelectAfterReload = configPanelAfterReload.locator('.mobile-button-macro');
        const selectedMacro = await macroSelectAfterReload.inputValue();
        expect(selectedMacro, 'macro should still be command after reload').toBe('command');

        // Verify the command is still set
        const commandInputAfterReload = configPanelAfterReload.locator('textarea');
        await expect(commandInputAfterReload, 'command input should be visible after reload').toBeVisible();
        const commandValue = await commandInputAfterReload.inputValue();
        expect(commandValue, 'command should still be test command after reload').toBe('test command');

        // Verify the label is still set
        const labelInputAfterReload = configPanelAfterReload.locator('.mobile-button-label');
        const labelValue = await labelInputAfterReload.inputValue();
        expect(labelValue, 'label should still be Test Button after reload').toBe('Test Button');

        // Verify the color is still set
        const colorRowAfterReload = configPanelAfterReload.locator('.mobile-button-color-row').first();
        const colorInputAfterReload = colorRowAfterReload.locator('input[type="color"]');
        const colorValue = await colorInputAfterReload.inputValue();
        expect(colorValue, 'color should still be #ff0000 after reload').toBe('#ff0000');
    });

    test('should configure button with different macro types', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Open mobile buttons settings modal
        const modal = await openMobileButtonsSettings(page);
        await expect(modal).toBeVisible();

        // Get the current visible preview grid (solo mode by default)
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await expect(soloPreview, 'solo preview grid should be visible').toBeVisible();

        // Wait for buttons to be rendered in the visible grid
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        const button1 = soloPreview.locator('[data-button-id="button-1"]');
        await button1.click();

        const configPanel = page.locator('.mobile-button-config');
        await expect(configPanel).toBeVisible();

        const macroSelect = configPanel.locator('.mobile-button-macro');

        // Test "kierunek" (direction) macro
        await macroSelect.selectOption('kierunek');

        // Check that direction select appears
        const directionSelect = configPanel.locator('select').nth(1);
        await expect(directionSelect, 'direction select should be visible for kierunek macro').toBeVisible();

        // Close config panel
        const closeButton = configPanel.locator('.btn-close');
        await closeButton.click();
        await expect(configPanel).not.toBeVisible();

        // Test another button with command macro
        const button3 = soloPreview.locator('[data-button-id="button-3"]');
        await button3.click();

        await expect(configPanel).toBeVisible();

        const macroSelect2 = configPanel.locator('.mobile-button-macro');
        await macroSelect2.selectOption('command');

        const commandInput = configPanel.locator('textarea');
        await expect(commandInput, 'command input should be visible for command macro').toBeVisible();
    });

    test('should switch between different button modes', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Open mobile buttons settings modal
        const modal = await openMobileButtonsSettings(page);
        await expect(modal).toBeVisible();

        // Check that mode toggle buttons exist. Solo is labelled "Bazowy" because
        // team/leader are stored as sparse overrides on top of it, and the mode
        // matching the character's current team state gets a marker appended, so
        // match on the label prefix rather than the exact accessible name.
        const soloButton = page.getByRole('button', { name: /^Bazowy/ });
        const teamButton = page.getByRole('button', { name: /^W druzynie/ });
        const leaderButton = page.getByRole('button', { name: /^Prowadzacy/ });

        await expect(soloButton, 'solo mode button should be visible').toBeVisible();
        await expect(teamButton, 'team mode button should be visible').toBeVisible();
        await expect(leaderButton, 'leader mode button should be visible').toBeVisible();

        // Click on team mode
        await teamButton.click();

        // Verify that the team preview grid is visible
        const teamGrid = page.locator('#mobile-buttons-preview-team');
        await expect(teamGrid, 'team buttons preview grid should be visible').toBeVisible();

        // Click on leader mode
        await leaderButton.click();

        // Verify that the leader preview grid is visible
        const leaderGrid = page.locator('#mobile-buttons-preview-leader');
        await expect(leaderGrid, 'leader buttons preview grid should be visible').toBeVisible();

        // Switch back to solo mode
        await soloButton.click();

        const soloGrid = page.locator('#mobile-buttons-preview-solo');
        await expect(soloGrid, 'solo buttons preview grid should be visible').toBeVisible();
    });

    test('clicking configured button sends command', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Open mobile buttons settings modal
        const modal = await openMobileButtonsSettings(page);

        // Get the solo preview grid
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        // Configure button-1 with a command
        const button1 = soloPreview.locator('[data-button-id="button-1"]');
        await button1.click();

        const configPanel = page.locator('.mobile-button-config');
        await expect(configPanel, 'configuration panel should be visible').toBeVisible();

        const macroSelect = configPanel.locator('.mobile-button-macro');
        await macroSelect.selectOption('command');

        const commandInput = configPanel.locator('textarea');
        await commandInput.fill('zerknij');

        const labelInput = configPanel.locator('.mobile-button-label');
        await labelInput.fill('Zerknij');

        // Close the config panel first
        const closeButton = configPanel.locator('.btn-close');
        await closeButton.click();
        await expect(configPanel, 'config panel should close').not.toBeVisible();

        // Save and close modal
        await page.locator(MOBILE_BUTTONS_SAVE).click();
        await expect(modal, 'modal should close after save').not.toBeVisible();

        // Now click the actual button in the mobile buttons container
        const mobileButtons = page.locator('#mobile-direction-buttons');
        const actualButton1 = mobileButtons.locator('#button-1');
        await expect(actualButton1, 'button-1 should be visible').toBeVisible();

        // Click the button
        await actualButton1.click();

        // Verify the command was sent
        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand, 'should send configured command when button clicked').toBe('zerknij');
    });

    test('direction button sends direction command', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // The direction buttons are pre-configured - click north button
        const mobileButtons = page.locator('#mobile-direction-buttons');
        const northButton = mobileButtons.locator('#n-button');
        await expect(northButton, 'north button should be visible').toBeVisible();

        // Click the north button
        await northButton.click();

        // Verify the direction command was sent
        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand, 'should send north direction command').toBe('n');
    });
});

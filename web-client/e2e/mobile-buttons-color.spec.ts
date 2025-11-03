import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';
import { ensureGameSocket, waitForClientReady } from './support/mocks';

test.describe('Mobile buttons color and command configuration', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 500, height: 900 });
    });

    test('should display mobile buttons modal and configure button colors', async ({ page }) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        // Open the mobile buttons modal
        // First, we need to find and click the button that opens the modal
        // Looking for a button or link that opens mobile-buttons-modal
        await page.evaluate(() => {
            const modalElement = document.getElementById('mobile-buttons-modal');
            if (modalElement) {
                // Use Bootstrap modal API to show the modal
                const bootstrap = (window as any).bootstrap;
                if (bootstrap && bootstrap.Modal) {
                    const modal = new bootstrap.Modal(modalElement);
                    modal.show();
                }
            }
        });

        // Wait for the modal to be visible
        const modal = page.locator('#mobile-buttons-modal');
        await expect(modal, 'mobile buttons modal should be visible').toBeVisible();

        // Check that the modal body container is visible
        const modalBody = modal.locator('.modal-body');
        await expect(modalBody, 'modal body should be visible').toBeVisible();

        // Check that the mobile-buttons-options container exists
        const optionsContainer = page.locator('#mobile-buttons-options');
        await expect(optionsContainer, 'mobile buttons options container should be visible').toBeVisible();

        // Wait for buttons to be rendered
        await page.waitForSelector('[data-button-id="button-0"]', { timeout: 5000 });

        // Check that specific buttons are visible using data-button-id attribute
        const button0 = page.locator('[data-button-id="button-0"]');
        await expect(button0, 'button-0 should be visible').toBeVisible();

        const button1 = page.locator('[data-button-id="button-1"]');
        await expect(button1, 'button-1 should be visible').toBeVisible();

        const button2 = page.locator('[data-button-id="button-2"]');
        await expect(button2, 'button-2 should be visible').toBeVisible();

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

        // Check that color input is visible
        const colorInput = configPanel.locator('.mobile-button-color');
        await expect(colorInput.first(), 'color input should be visible').toBeVisible();

        // Change the button color
        await colorInput.first().fill('#ff0000');

        // Verify the button color changed
        const buttonStyle = await button2.evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
        });
        // RGB value of #ff0000 is rgb(255, 0, 0)
        expect(buttonStyle, 'button background color should be red').toBe('rgb(255, 0, 0)');

        // Change the macro type to "command"
        await macroSelect.selectOption('command');

        // Wait for command textarea to appear
        const commandInput = configPanel.locator('.mobile-button-command');
        await expect(commandInput, 'command input should be visible').toBeVisible();

        // Set a command
        await commandInput.fill('test command');

        // Set a label
        await labelInput.fill('Test Button');

        // Verify the label changed
        const buttonText = await button2.textContent();
        expect(buttonText, 'button label should be updated').toBe('Test Button');

        // Save the configuration
        const saveButton = page.locator('#mobile-buttons-save');
        await expect(saveButton, 'save button should be visible').toBeVisible();
        await saveButton.click();

        // Verify the modal closes
        await expect(modal, 'modal should be hidden after save').not.toBeVisible({ timeout: 5000 });
    });

    test('should configure button with different macro types', async ({ page }) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        // Open the mobile buttons modal programmatically
        await page.evaluate(() => {
            const modalElement = document.getElementById('mobile-buttons-modal');
            if (modalElement) {
                const bootstrap = (window as any).bootstrap;
                if (bootstrap && bootstrap.Modal) {
                    const modal = new bootstrap.Modal(modalElement);
                    modal.show();
                }
            }
        });

        const modal = page.locator('#mobile-buttons-modal');
        await expect(modal).toBeVisible();

        // Wait for buttons to be rendered
        await page.waitForSelector('[data-button-id="button-1"]', { timeout: 5000 });

        const button1 = page.locator('[data-button-id="button-1"]');
        await button1.click();

        const configPanel = page.locator('.mobile-button-config');
        await expect(configPanel).toBeVisible();

        const macroSelect = configPanel.locator('.mobile-button-macro');

        // Test "kierunek" (direction) macro
        await macroSelect.selectOption('kierunek');

        // Check that direction select appears
        const directionSelect = configPanel.locator('.mobile-button-direction');
        await expect(directionSelect, 'direction select should be visible for kierunek macro').toBeVisible();

        // Close config panel
        const closeButton = configPanel.locator('.btn-close');
        await closeButton.click();
        await expect(configPanel).not.toBeVisible();

        // Test another button with command macro
        const button3 = page.locator('[data-button-id="button-3"]');
        await button3.click();

        await expect(configPanel).toBeVisible();

        const macroSelect2 = configPanel.locator('.mobile-button-macro');
        await macroSelect2.selectOption('command');

        const commandInput = configPanel.locator('.mobile-button-command');
        await expect(commandInput, 'command input should be visible for command macro').toBeVisible();
    });

    test('should switch between different button modes', async ({ page }) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        // Open the mobile buttons modal
        await page.evaluate(() => {
            const modalElement = document.getElementById('mobile-buttons-modal');
            if (modalElement) {
                const bootstrap = (window as any).bootstrap;
                if (bootstrap && bootstrap.Modal) {
                    const modal = new bootstrap.Modal(modalElement);
                    modal.show();
                }
            }
        });

        const modal = page.locator('#mobile-buttons-modal');
        await expect(modal).toBeVisible();

        // Check that mode toggle buttons exist
        const soloButton = page.getByRole('button', { name: 'Bez drużyny' });
        const teamButton = page.getByRole('button', { name: 'W drużynie' });
        const leaderButton = page.getByRole('button', { name: 'Prowadzący' });

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
});

import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

async function login(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
    await page.waitForTimeout(100);
}

async function openLogsModal(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#logs-button');
    await page.waitForSelector('#logs-modal.show', {timeout: 5000});
    // Wait for React component to mount and render the toggle
    await page.waitForSelector('#logs-enabled', {timeout: 5000});
}

async function closeLogsModal(page: Page): Promise<void> {
    await page.locator('#logs-modal .btn-close').click();
    await page.waitForSelector('#logs-modal.show', {state: 'hidden', timeout: 5000});
}

test.describe('Logging toggle', () => {
    test.beforeEach(async ({page}) => {
        await login(page);
    });

    test('logging toggle is visible and can be toggled on and off', async ({page}) => {
        await openLogsModal(page);

        const loggingToggle = page.locator('#logs-enabled');
        await expect(loggingToggle).toBeVisible();

        // Get initial state
        const initialChecked = await loggingToggle.isChecked();

        // Toggle it
        await loggingToggle.click();
        await page.waitForTimeout(100);

        // Verify the state changed
        const afterFirstToggle = await loggingToggle.isChecked();
        expect(afterFirstToggle).toBe(!initialChecked);

        // Toggle it back
        await loggingToggle.click();
        await page.waitForTimeout(100);

        // Verify it returned to original state
        const afterSecondToggle = await loggingToggle.isChecked();
        expect(afterSecondToggle).toBe(initialChecked);

        await closeLogsModal(page);
    });

    test('logging toggle label is present', async ({page}) => {
        await openLogsModal(page);

        // Verify the label text
        const label = page.locator('label[for="logs-enabled"]');
        await expect(label).toBeVisible();
        await expect(label).toHaveText('Zapisuj logi');

        await closeLogsModal(page);
    });

    test('logging enabled state persists after page reload', async ({page}) => {
        await openLogsModal(page);

        const loggingToggle = page.locator('#logs-enabled');

        // Ensure logging is enabled first
        const isChecked = await loggingToggle.isChecked();
        if (!isChecked) {
            await loggingToggle.click();
            await page.waitForTimeout(100);
        }
        await expect(loggingToggle).toBeChecked();

        await closeLogsModal(page);

        // Reload the page
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await page.waitForTimeout(200);

        // Re-open logs modal
        await openLogsModal(page);

        // Verify logging is still enabled
        const toggleAfterReload = page.locator('#logs-enabled');
        await expect(toggleAfterReload).toBeChecked();

        await closeLogsModal(page);
    });

    test('logging disabled state persists after page reload', async ({page}) => {
        await openLogsModal(page);

        const loggingToggle = page.locator('#logs-enabled');

        // Disable logging
        const isChecked = await loggingToggle.isChecked();
        if (isChecked) {
            await loggingToggle.click();
            await page.waitForTimeout(100);
        }
        await expect(loggingToggle).not.toBeChecked();

        await closeLogsModal(page);

        // Reload the page
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await page.waitForTimeout(200);

        // Re-open logs modal
        await openLogsModal(page);

        // Verify logging is still disabled
        const toggleAfterReload = page.locator('#logs-enabled');
        await expect(toggleAfterReload).not.toBeChecked();

        await closeLogsModal(page);
    });
});

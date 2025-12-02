import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const UI_SETTINGS_BUTTON = '#ui-settings-button';
const UI_MODAL = '#ui-settings-modal';

async function openUiSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(UI_SETTINGS_BUTTON);
    const modal = page.locator(UI_MODAL);
    await expect(modal, 'should open UI settings modal').toBeVisible();
    return modal;
}

test.describe('Fight title icon', () => {
    test('shows combat icon when in combat', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Verify initial title shows idle prefix
        await expect(page, 'should show idle prefix initially').toHaveTitle(/^ㅤ /);

        // Set player info
        await pushGmcp(page, 'char.info', {
            object_num: 12345,
        });

        // Enter combat
        await pushGmcp(page, 'objects.data', {
            12345: {attack_num: 67890},
        });

        // Title should now show combat icon
        await expect(page, 'should show combat icon when fighting').toHaveTitle(/^⚔ /);
    });

    test('removes combat icon when combat ends', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set player info
        await pushGmcp(page, 'char.info', {
            object_num: 12345,
        });

        // Enter combat
        await pushGmcp(page, 'objects.data', {
            12345: {attack_num: 67890},
        });

        // Wait for combat icon to appear
        await expect(page, 'should show combat icon when fighting').toHaveTitle(/^⚔ /);

        // Exit combat
        await pushGmcp(page, 'objects.data', {
            12345: {attack_num: false},
        });

        // Title should now show idle prefix again
        await expect(page, 'should show idle prefix after combat ends').toHaveTitle(/^ㅤ /);
    });

    test('respects fight title icon setting when disabled', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set player info first
        await pushGmcp(page, 'char.info', {
            object_num: 12345,
        });

        // Disable the fight title icon setting
        const modal = await openUiSettings(page);
        const checkbox = modal.locator('#ui-fight-title-icon');
        if (await checkbox.isChecked()) {
            await checkbox.uncheck();
        }
        await modal.locator('#ui-settings-save').click();
        await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();

        // Get the base title without prefix
        const currentTitle = await page.title();
        const baseTitle = currentTitle.replace(/^[ㅤ⚔]\s*/, '');

        // Enter combat
        await pushGmcp(page, 'objects.data', {
            12345: {attack_num: 67890},
        });

        // Title should not have combat icon prefix when setting is disabled
        await expect(page, 'should not show combat icon when setting is disabled').toHaveTitle(baseTitle);
    });

    test('shows combat icon when setting is re-enabled', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set player info first
        await pushGmcp(page, 'char.info', {
            object_num: 12345,
        });

        // First disable the setting
        let modal = await openUiSettings(page);
        let checkbox = modal.locator('#ui-fight-title-icon');
        if (await checkbox.isChecked()) {
            await checkbox.uncheck();
        }
        await modal.locator('#ui-settings-save').click();
        await expect(modal, 'should close UI settings modal').not.toBeVisible();

        // Enter combat while setting is disabled
        await pushGmcp(page, 'objects.data', {
            12345: {attack_num: 67890},
        });

        // Now re-enable the setting
        modal = await openUiSettings(page);
        checkbox = modal.locator('#ui-fight-title-icon');
        await checkbox.check();
        await modal.locator('#ui-settings-save').click();
        await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();

        // Title should now show combat icon since we're still in combat
        await expect(page, 'should show combat icon after re-enabling setting').toHaveTitle(/^⚔ /);
    });
});

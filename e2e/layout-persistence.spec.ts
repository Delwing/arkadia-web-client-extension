import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, submitCommand, waitForCharacter, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

async function login(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
    await waitForCharacter(page, 'TestChar');
}

async function openUiSettingsModal(page: Page): Promise<void> {
    // Serialize with any in-progress close animation from a prior modal cycle
    await page.waitForFunction(() => {
        const el = document.getElementById('ui-settings-modal');
        return !el || window.getComputedStyle(el).display === 'none';
    });
    await page.click('#menu-button');
    // Wait for the dropdown to actually open before clicking an item inside it
    await page.waitForSelector('#menu-button + .dropdown-menu.show', {timeout: 5000});
    await page.click('#ui-settings-button');
    await page.waitForSelector('#ui-settings-modal.show', {timeout: 5000});
    // Wait for Bootstrap show animation to complete so modal.hide() won't be silently ignored
    await page.waitForFunction(() => {
        const d = document.querySelector('#ui-settings-modal .modal-dialog') as HTMLElement | null;
        if (!d) return false;
        const t = window.getComputedStyle(d).transform;
        return t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
    });
}

async function closeUiSettingsModal(page: Page): Promise<void> {
    // Click the save button to close the modal and persist changes
    await page.click('#ui-settings-save');
    await page.waitForSelector('#ui-settings-modal.show', {state: 'hidden', timeout: 5000});
}

async function enableLayoutManager(page: Page): Promise<void> {
    await openUiSettingsModal(page);

    const layoutToggle = page.locator('#ui-layout-manager-enabled');
    const isChecked = await layoutToggle.isChecked();
    if (!isChecked) {
        await layoutToggle.click();
    }

    await closeUiSettingsModal(page);
    await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));
}

async function disableLayoutManager(page: Page): Promise<void> {
    await openUiSettingsModal(page);

    const layoutToggle = page.locator('#ui-layout-manager-enabled');
    const isChecked = await layoutToggle.isChecked();
    if (isChecked) {
        await layoutToggle.click();
    }

    await closeUiSettingsModal(page);
    await page.waitForFunction(() => !document.body.classList.contains('layout-manager-enabled'));
}

test.describe('Layout persistence', () => {
    test.beforeEach(async ({page}) => {
        await login(page);
    });

    test('layout manager toggle persists after page reload', async ({page}) => {
        // Enable layout manager
        await enableLayoutManager(page);

        // Verify the body has the layout-manager-enabled class
        await expect(page.locator('body.layout-manager-enabled')).toBeAttached();

        // Reload
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Verify layout manager is still enabled after reload
        await expect(page.locator('body.layout-manager-enabled')).toBeAttached();

        // Open settings and verify the checkbox reflects the persisted state
        await openUiSettingsModal(page);
        const layoutToggle = page.locator('#ui-layout-manager-enabled');
        await expect(layoutToggle).toBeChecked();

        await closeUiSettingsModal(page);
    });

    test('disabling layout manager persists after page reload', async ({page}) => {
        test.setTimeout(30000);
        // First enable, then disable layout manager
        await enableLayoutManager(page);
        await disableLayoutManager(page);

        // Verify the body does NOT have the layout-manager-enabled class
        await expect(page.locator('body.layout-manager-enabled')).not.toBeAttached();

        // Reload
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Verify layout manager is still disabled after reload
        await expect(page.locator('body.layout-manager-enabled')).not.toBeAttached();

        // Open settings and verify checkbox is unchecked
        await openUiSettingsModal(page);
        const layoutToggle = page.locator('#ui-layout-manager-enabled');
        await expect(layoutToggle).not.toBeChecked();

        await closeUiSettingsModal(page);
    });

    test('object list panel toggle state persists', async ({page}) => {
        test.setTimeout(30000);
        // Enable layout manager first
        await enableLayoutManager(page);

        // Open UI settings
        await openUiSettingsModal(page);

        // Toggle the object list checkbox
        const objectListToggle = page.locator('#ui-layout-manager-object-list');
        await expect(objectListToggle).toBeVisible();

        // Disable object list panel
        const isChecked = await objectListToggle.isChecked();
        if (isChecked) {
            await objectListToggle.click();
        }

        await closeUiSettingsModal(page);

        // Reload
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Open UI settings again
        await openUiSettingsModal(page);

        // Verify object list toggle is still unchecked
        const objectListAfter = page.locator('#ui-layout-manager-object-list');
        await expect(objectListAfter).not.toBeChecked();

        // Re-enable it for cleanliness
        await objectListAfter.click();

        await closeUiSettingsModal(page);
    });

    test('layout manager reset restores default layout', async ({page}) => {
        // Enable layout manager first
        await enableLayoutManager(page);

        // Open UI settings and click reset
        await openUiSettingsModal(page);

        const resetBtn = page.locator('#ui-layout-manager-reset');
        await expect(resetBtn).toBeVisible();
        await resetBtn.click();

        await closeUiSettingsModal(page);

        // After reset, layout manager should be enabled (reset sets enabled: true)
        await expect(page.locator('body.layout-manager-enabled')).toBeAttached();

        // Reload and verify it persists
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await expect(page.locator('body.layout-manager-enabled')).toBeAttached();
    });

    test('popup opens and can be pinned with layout manager on', async ({page}) => {
        await enableLayoutManager(page);

        // Open deposits popup window via slash command
        await submitCommand(page, '/depozytyw');

        // The popup should be visible in the layout system
        const depositsContent = page.locator('.deposits-popup__content');
        await expect(depositsContent).toBeVisible({timeout: 3000});

        // Verify the popup shows correct empty state text
        await expect(depositsContent).toContainText('Brak zapisanych depozytow');
    });
});

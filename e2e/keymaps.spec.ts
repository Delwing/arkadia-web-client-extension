import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

async function openBindsModal(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#binds-button');
    await page.waitForSelector('#binds-modal.show', {timeout: 5000});
    // Wait for React to render the keymap UI
    await page.waitForSelector('#binds-modal .form-select', {timeout: 5000});
}

async function closeBindsModal(page: Page): Promise<void> {
    await page.locator('#binds-modal .btn-close').click();
    await page.waitForSelector('#binds-modal.show', {state: 'hidden', timeout: 5000});
}

async function login(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
    await page.waitForTimeout(100);
}

test.describe('Keymaps management', () => {
    test.beforeEach(async ({page}) => {
        await login(page);
    });

    test('default keymap exists and is visible in the binds modal', async ({page}) => {
        await openBindsModal(page);

        // The keymap selector should be visible with the label
        const keymapLabel = page.locator('#binds-modal').locator('text=Mapa klawiszy:');
        await expect(keymapLabel).toBeVisible();

        // The select should have the default keymap option
        const keymapSelect = page.locator('#binds-modal .form-select').first();
        await expect(keymapSelect).toBeVisible();

        // The default keymap should contain an option (at minimum one)
        const options = keymapSelect.locator('option');
        const count = await options.count();
        expect(count).toBeGreaterThanOrEqual(1);

        // Default keymap name should be present
        const firstOptionText = await options.first().textContent();
        expect(firstOptionText).toBeTruthy();

        await closeBindsModal(page);
    });

    test('create a new keymap and verify it appears in the list', async ({page}) => {
        await openBindsModal(page);

        const keymapSelect = page.locator('#binds-modal .form-select').first();

        // Count initial keymaps
        const initialCount = await keymapSelect.locator('option').count();

        // Click "Nowa mapa" button to create a new keymap
        await page.locator('#binds-modal button:has-text("Nowa mapa")').click();
        await page.waitForTimeout(200);

        // Creating a new keymap enters rename mode (select is replaced by an input).
        // Finish rename first so the select reappears.
        const renameInput = page.locator('#binds-modal input[type="text"][autocorrect="off"]');
        const isRenameVisible = await renameInput.isVisible().catch(() => false);

        if (isRenameVisible) {
            await renameInput.press('Enter');
            await page.waitForTimeout(200);
        }

        // Wait for the select to be visible again after rename finishes
        await keymapSelect.waitFor({state: 'visible', timeout: 3000});

        // Verify the select now has one more entry
        const finalCount = await keymapSelect.locator('option').count();
        expect(finalCount).toBe(initialCount + 1);

        await closeBindsModal(page);
    });

    test('switch between keymaps and verify selection changes', async ({page}) => {
        await openBindsModal(page);

        const keymapSelect = page.locator('#binds-modal .form-select').first();

        // Create a second keymap first
        await page.locator('#binds-modal button:has-text("Nowa mapa")').click();
        await page.waitForTimeout(200);

        // If rename input appeared, finish it
        const renameInput = page.locator('#binds-modal input[type="text"]').first();
        const isRenameVisible = await renameInput.isVisible().catch(() => false);
        if (isRenameVisible) {
            await renameInput.press('Enter');
            await page.waitForTimeout(100);
        }

        // Get the current selected keymap value
        const currentValue = await keymapSelect.inputValue();

        // Get all option values
        const options = keymapSelect.locator('option');
        const optionCount = await options.count();
        expect(optionCount).toBeGreaterThanOrEqual(2);

        // Find a different keymap value to switch to
        let otherValue: string | null = null;
        for (let i = 0; i < optionCount; i++) {
            const val = await options.nth(i).getAttribute('value');
            if (val && val !== currentValue) {
                otherValue = val;
                break;
            }
        }
        expect(otherValue).not.toBeNull();

        // Switch to the other keymap
        await keymapSelect.selectOption(otherValue!);
        await page.waitForTimeout(200);

        // Verify the selection changed
        const newValue = await keymapSelect.inputValue();
        expect(newValue).toBe(otherValue);

        await closeBindsModal(page);
    });

    test('active keymap persists after page reload', async ({page}) => {
        await openBindsModal(page);

        // Create a second keymap
        await page.locator('#binds-modal button:has-text("Nowa mapa")').click();
        await page.waitForTimeout(200);

        // Finish rename if input appears
        const renameInput = page.locator('#binds-modal input[type="text"]').first();
        const isRenameVisible = await renameInput.isVisible().catch(() => false);
        if (isRenameVisible) {
            await renameInput.press('Enter');
            await page.waitForTimeout(100);
        }

        const keymapSelect = page.locator('#binds-modal .form-select').first();

        // Get all option values and find the non-default one
        const options = keymapSelect.locator('option');
        const optionCount = await options.count();
        expect(optionCount).toBeGreaterThanOrEqual(2);

        // Remember the current selection
        const selectedValue = await keymapSelect.inputValue();
        const selectedText = await keymapSelect.locator(`option[value="${selectedValue}"]`).textContent();

        await closeBindsModal(page);

        // Reload the page
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await page.waitForTimeout(200);

        // Open binds modal again
        await openBindsModal(page);

        // Verify the same keymap is still selected
        const keymapSelectAfter = page.locator('#binds-modal .form-select').first();
        const afterValue = await keymapSelectAfter.inputValue();
        expect(afterValue).toBe(selectedValue);

        // Verify the name still matches
        const afterText = await keymapSelectAfter.locator(`option[value="${afterValue}"]`).textContent();
        expect(afterText).toBe(selectedText);

        await closeBindsModal(page);
    });

    test('rename a keymap and verify the name changes', async ({page}) => {
        await openBindsModal(page);

        const keymapSelect = page.locator('#binds-modal .form-select').first();

        // Create a new keymap to rename (avoid renaming the default)
        await page.locator('#binds-modal button:has-text("Nowa mapa")').click();
        await page.waitForTimeout(200);

        // If rename input appeared automatically, set the name now
        let renameInput = page.locator('#binds-modal input[type="text"][autocorrect="off"]');
        let isRenameVisible = await renameInput.isVisible().catch(() => false);

        if (isRenameVisible) {
            // Clear and type new name directly
            await renameInput.fill('TestKeymap');
            await renameInput.press('Enter');
            await page.waitForTimeout(200);
        } else {
            // Click the "Zmień nazwę" (Rename) button
            await page.locator('#binds-modal button:has-text("Zmień nazwę")').click();
            await page.waitForTimeout(100);

            renameInput = page.locator('#binds-modal input[type="text"][autocorrect="off"]');
            isRenameVisible = await renameInput.isVisible().catch(() => false);

            if (isRenameVisible) {
                await renameInput.fill('TestKeymap');
                await renameInput.press('Enter');
                await page.waitForTimeout(200);
            }
        }

        // After rename, the select should show the new name
        const updatedOptions = keymapSelect.locator('option');
        const optionTexts: string[] = [];
        const count = await updatedOptions.count();
        for (let i = 0; i < count; i++) {
            const text = await updatedOptions.nth(i).textContent();
            if (text) optionTexts.push(text);
        }

        expect(optionTexts).toContain('TestKeymap');

        // Reload and verify the name persists
        await closeBindsModal(page);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await page.waitForTimeout(200);

        await openBindsModal(page);

        const afterOptions = page.locator('#binds-modal .form-select').first().locator('option');
        const afterTexts: string[] = [];
        const afterCount = await afterOptions.count();
        for (let i = 0; i < afterCount; i++) {
            const text = await afterOptions.nth(i).textContent();
            if (text) afterTexts.push(text);
        }

        expect(afterTexts).toContain('TestKeymap');

        await closeBindsModal(page);
    });
});

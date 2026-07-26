import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, waitForCharacter, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openBindsModal(page: Page): Promise<void> {
    await page.click('#menu-button');
    // Wait for any in-progress close animation to finish before opening
    await page.waitForFunction(() => {
        const el = document.getElementById('binds-modal');
        return !el || window.getComputedStyle(el).display === 'none';
    });
    await page.click('#binds-button');
    await page.waitForSelector('#binds-modal.show', {timeout: 5000});
    await page.waitForSelector('#binds-modal .form-select', {timeout: 5000});
    // Wait for Bootstrap show animation to complete so modal.hide() won't be silently ignored
    await page.waitForFunction(() => {
        const d = document.querySelector('#binds-modal .modal-dialog') as HTMLElement | null;
        if (!d) return false;
        const t = window.getComputedStyle(d).transform;
        return t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
    });
}

async function closeBindsModal(page: Page): Promise<void> {
    await page.locator('#binds-modal .btn-close').first().click();
    await page.waitForSelector('#binds-modal.show', {state: 'hidden', timeout: 5000});
}

async function login(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
    await waitForCharacter(page, 'TestChar');
}

/**
 * Create a new keymap in the binds modal using the "Nowa mapa" button and
 * finish the automatic rename prompt.  Returns after the keymap select is
 * visible again.
 */
async function createKeymap(page: Page): Promise<void> {
    await page.locator('#binds-modal button:has-text("Nowa mapa")').click();

    // Creating a keymap triggers inline rename mode — dismiss it
    const renameInput = page.locator('#binds-modal input[type="text"][autocorrect="off"]');
    const isRenameVisible = await renameInput.isVisible().catch(() => false);
    if (isRenameVisible) {
        await renameInput.press('Enter');
    }

    // Wait for the keymap select to reappear after the rename completes
    await page.locator('#binds-modal .form-select').first().waitFor({state: 'visible', timeout: 3000});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Keymap deletion', () => {
    test.beforeEach(async ({page}) => {
        await login(page);
    });

    // -----------------------------------------------------------------------
    // 1. Delete button is disabled when only one keymap exists
    // -----------------------------------------------------------------------

    test('delete button is disabled when only one keymap exists', async ({page}) => {
        await openBindsModal(page);

        const keymapSelect = page.locator('#binds-modal .form-select').first();
        const optionCount = await keymapSelect.locator('option').count();

        // This test only makes sense when there is exactly one keymap in storage
        // (fresh page, no other keymaps created)
        if (optionCount === 1) {
            const deleteBtn = page.locator('#binds-modal button:has-text("Usuń")').first();
            await expect(deleteBtn).toBeDisabled();
        } else {
            // More than one keymap exists: delete until only one remains so we
            // can test the disabled state.  This keeps the test deterministic
            // across re-runs in persistent storage environments.
            while ((await keymapSelect.locator('option').count()) > 1) {
                // Switch to last option (non-default) and delete
                const opts = keymapSelect.locator('option');
                const count = await opts.count();
                const lastVal = await opts.nth(count - 1).getAttribute('value');
                if (lastVal) {
                    await keymapSelect.selectOption(lastVal);
                }
                await page.locator('#binds-modal button:has-text("Usuń")').first().click();
                const confirmDelete = page.locator('button:has-text("Usuń")').last();
                await confirmDelete.click();
                await page.waitForTimeout(300);
            }

            const deleteBtn = page.locator('#binds-modal button:has-text("Usuń")').first();
            await expect(deleteBtn).toBeDisabled();
        }

        await closeBindsModal(page);
    });

    // -----------------------------------------------------------------------
    // 2. Deleting a keymap removes it from the list
    // -----------------------------------------------------------------------

    test('deleting a keymap removes it from the dropdown list', async ({page}) => {
        await openBindsModal(page);

        const keymapSelect = page.locator('#binds-modal .form-select').first();

        // Ensure we start with a known second keymap
        await createKeymap(page);

        const countBefore = await keymapSelect.locator('option').count();
        expect(countBefore).toBeGreaterThanOrEqual(2);

        // Find a non-default option to delete (the newly created one should be selected)
        const currentValue = await keymapSelect.inputValue();

        // Click the "Usuń" (delete keymap) button
        await page.locator('#binds-modal button:has-text("Usuń")').first().click();

        // Confirmation modal should appear; click the danger "Usuń" button inside it
        const confirmModal = page.locator('.modal.show').last();
        await confirmModal.locator('button.btn-danger:has-text("Usuń")').click();

        // Wait for the select to refresh
        await page.waitForTimeout(300);

        const countAfter = await keymapSelect.locator('option').count();
        expect(countAfter).toBe(countBefore - 1);

        // The deleted keymap's id should no longer be in the list
        const remainingValues: string[] = [];
        const opts = keymapSelect.locator('option');
        const n = await opts.count();
        for (let i = 0; i < n; i++) {
            const v = await opts.nth(i).getAttribute('value');
            if (v) remainingValues.push(v);
        }
        expect(remainingValues).not.toContain(currentValue);

        await closeBindsModal(page);
    });

    // -----------------------------------------------------------------------
    // 3. After deletion another keymap becomes the active selection
    // -----------------------------------------------------------------------

    test('another keymap is selected after the current one is deleted', async ({page}) => {
        await openBindsModal(page);

        const keymapSelect = page.locator('#binds-modal .form-select').first();

        // Create a second keymap so we can delete it
        await createKeymap(page);

        // The new keymap is now active; remember its value
        const deletedValue = await keymapSelect.inputValue();

        // Delete it
        await page.locator('#binds-modal button:has-text("Usuń")').first().click();
        const confirmModal = page.locator('.modal.show').last();
        await confirmModal.locator('button.btn-danger:has-text("Usuń")').click();
        await page.waitForTimeout(300);

        // After deletion the select should show a different (existing) keymap
        const newValue = await keymapSelect.inputValue();
        expect(newValue).not.toBe(deletedValue);
        expect(newValue).toBeTruthy();

        await closeBindsModal(page);
    });

    // -----------------------------------------------------------------------
    // 4. Deletion persists after a page reload
    // -----------------------------------------------------------------------

    test('deleted keymap is absent after page reload', async ({page}) => {
        // This case is legitimately heavy for the default 10s budget: it creates
        // and deletes a keymap, does a full page reload, then re-establishes the
        // mock game socket and reopens the binds modal. Under CI load that
        // reconnect (ensureGameSocket) intermittently tips the test over the
        // timeout mid-`page.evaluate`. Triple the budget for this one test.
        test.slow();
        await openBindsModal(page);

        const keymapSelect = page.locator('#binds-modal .form-select').first();

        // Create a second keymap
        await createKeymap(page);

        const deletedValue = await keymapSelect.inputValue();

        // Delete it
        await page.locator('#binds-modal button:has-text("Usuń")').first().click();
        const confirmModal = page.locator('.modal.show').last();
        await confirmModal.locator('button.btn-danger:has-text("Usuń")').click();
        await page.waitForTimeout(300);

        await closeBindsModal(page);

        // Reload the page
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await openBindsModal(page);

        const keymapSelectAfter = page.locator('#binds-modal .form-select').first();
        const values: string[] = [];
        const opts = keymapSelectAfter.locator('option');
        const n = await opts.count();
        for (let i = 0; i < n; i++) {
            const v = await opts.nth(i).getAttribute('value');
            if (v) values.push(v);
        }
        expect(values).not.toContain(deletedValue);

        await closeBindsModal(page);
    });

    // -----------------------------------------------------------------------
    // 5. Clicking "Usuń" opens the confirmation modal
    // -----------------------------------------------------------------------

    test('clicking the delete button opens a confirmation modal', async ({page}) => {
        await openBindsModal(page);

        // Ensure at least two keymaps exist so the button is enabled
        await createKeymap(page);

        // Click the delete button
        await page.locator('#binds-modal button:has-text("Usuń")').first().click();

        // Confirmation modal should be visible with the expected title text
        const confirmModal = page.locator('.modal.show').last();
        await expect(confirmModal).toBeVisible();
        await expect(confirmModal.locator('.modal-title')).toContainText('map');

        // Dismiss the confirmation (cancel)
        await confirmModal.locator('button:has-text("Anuluj")').click();
        await page.waitForTimeout(200);

        // Confirmation modal should be gone, but binds modal should still be open
        await expect(page.locator('#binds-modal')).toBeVisible();

        await closeBindsModal(page);
    });
});

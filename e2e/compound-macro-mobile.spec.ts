import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    resetCommandLog,
    waitForCommandInput,
} from './support/mocks';
import { Page } from '@playwright/test';

const MENU_BUTTON = '#menu-button';
const MOBILE_BUTTONS_BUTTON = '#mobile-buttons-button';
const MOBILE_BUTTONS_MODAL = '#mobile-buttons-modal';
const MOBILE_BUTTONS_SAVE = '#mobile-buttons-save';

async function openMobileButtonsSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(MOBILE_BUTTONS_BUTTON);
    const modal = page.locator(MOBILE_BUTTONS_MODAL);
    await expect(modal).toBeVisible();
    return modal;
}

test.describe('Mobile buttons compound macro', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
    });

    test('compound macro UI shows steps editor when selected', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await openMobileButtonsSettings(page);
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        // Select button-1 and set macro to compound
        const button1 = soloPreview.locator('[data-button-id="button-1"]');
        await button1.click();

        const configPanel = page.locator('.mobile-button-config');
        await expect(configPanel).toBeVisible();

        const macroSelect = configPanel.locator('.mobile-button-macro');
        await macroSelect.selectOption('compound');

        // "Kroki" section and "+ Dodaj krok" button should appear
        await expect(page.getByText('Kroki')).toBeVisible();
        await expect(page.getByText('+ Dodaj krok')).toBeVisible();
    });

    test('can add and configure compound steps', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openMobileButtonsSettings(page);
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        const button1 = soloPreview.locator('[data-button-id="button-1"]');
        await button1.click();

        const configPanel = page.locator('.mobile-button-config');
        const macroSelect = configPanel.locator('.mobile-button-macro');
        await macroSelect.selectOption('compound');

        // Add first step
        await page.getByText('+ Dodaj krok').click();
        await expect(page.getByText('Krok 1')).toBeVisible();

        // Add second step
        await page.getByText('+ Dodaj krok').click();
        await expect(page.getByText('Krok 2')).toBeVisible();

        // Configure step 1 as command
        const steps = configPanel.locator('.border.rounded.mb-2.p-2');
        const step1 = steps.nth(0);
        const step1Select = step1.locator('select').first();
        await step1Select.selectOption('command');
        const step1Command = step1.locator('textarea');
        await step1Command.fill('zerknij');

        // Configure step 2 as direction
        const step2 = steps.nth(1);
        const step2Select = step2.locator('select').first();
        await step2Select.selectOption('kierunek');
        const step2Direction = step2.locator('select').nth(1);
        await step2Direction.selectOption('n');

        // Set label
        const labelInput = configPanel.locator('.mobile-button-label');
        await labelInput.fill('Combo');

        // Close config panel and save
        const closeButton = configPanel.locator('.btn-close');
        await closeButton.click();
        await page.locator(MOBILE_BUTTONS_SAVE).click();
        await expect(modal).not.toBeVisible({ timeout: 5000 });

        // Verify button label
        const mobileButtons = page.locator('#mobile-direction-buttons');
        const actualButton = mobileButtons.locator('#button-1');
        await expect(actualButton).toHaveText('Combo');
    });

    test('compound macro button sends all step commands', async ({ page }) => {
        // Pre-configure a compound button via localStorage
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'compound',
                            label: 'Combo',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            steps: [
                                { macro: 'command', command: 'zerknij' },
                                { macro: 'command', command: 'ekwipunek' },
                            ],
                        },
                    },
                },
                locked: false,
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await resetCommandLog(page);

        const mobileButtons = page.locator('#mobile-direction-buttons');
        const button = mobileButtons.locator('#button-1');
        await expect(button).toBeVisible();
        await button.click();

        // Verify both commands were sent
        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send both compound step commands', timeout: 5000 }
        ).toEqual(expect.arrayContaining(['zerknij', 'ekwipunek']));
    });

    test('compound macro with direction step sends direction command', async ({ page }) => {
        await page.addInitScript(() => {
            const settings = {
                solo: {
                    buttons: {
                        'button-1': {
                            macro: 'compound',
                            label: 'DirCombo',
                            color: '#6EB4DC',
                            fontColor: '#f1f5f9',
                            steps: [
                                { macro: 'command', command: 'zerknij' },
                                { macro: 'kierunek', direction: 'n' },
                            ],
                        },
                    },
                },
                locked: false,
            };
            localStorage.setItem('mobileButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await resetCommandLog(page);

        const mobileButtons = page.locator('#mobile-direction-buttons');
        const button = mobileButtons.locator('#button-1');
        await expect(button).toBeVisible();
        await button.click();

        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send command and direction steps', timeout: 5000 }
        ).toEqual(expect.arrayContaining(['zerknij', 'n']));
    });

    test('compound macro persists after reload', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Configure a compound button through the UI
        const modal = await openMobileButtonsSettings(page);
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        const button1 = soloPreview.locator('[data-button-id="button-1"]');
        await button1.click();

        const configPanel = page.locator('.mobile-button-config');
        const macroSelect = configPanel.locator('.mobile-button-macro');
        await macroSelect.selectOption('compound');

        await page.getByText('+ Dodaj krok').click();
        const steps = configPanel.locator('.border.rounded.mb-2.p-2');
        const step1 = steps.first();
        const step1Select = step1.locator('select').first();
        await step1Select.selectOption('command');
        const step1Command = step1.locator('textarea');
        await step1Command.fill('test_cmd');

        const labelInput = configPanel.locator('.mobile-button-label');
        await labelInput.fill('Persist');

        const closeButton = configPanel.locator('.btn-close');
        await closeButton.click();
        await page.locator(MOBILE_BUTTONS_SAVE).click();
        await expect(modal).not.toBeVisible({ timeout: 5000 });

        // Reload and verify
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const mobileButtons = page.locator('#mobile-direction-buttons');
        const actualButton = mobileButtons.locator('#button-1');
        await expect(actualButton).toHaveText('Persist');

        // Reopen settings and verify compound config
        await openMobileButtonsSettings(page);
        const soloPreviewReload = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreviewReload.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        const button1Reload = soloPreviewReload.locator('[data-button-id="button-1"]');
        await button1Reload.click();

        const configPanelReload = page.locator('.mobile-button-config');
        const macroSelectReload = configPanelReload.locator('.mobile-button-macro');
        const selectedMacro = await macroSelectReload.inputValue();
        expect(selectedMacro, 'macro should still be compound after reload').toBe('compound');

        await expect(page.getByText('Krok 1'), 'step 1 should still exist after reload').toBeVisible();
    });

    test('step reorder buttons work', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await openMobileButtonsSettings(page);
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        const button1 = soloPreview.locator('[data-button-id="button-1"]');
        await button1.click();

        const configPanel = page.locator('.mobile-button-config');
        const macroSelect = configPanel.locator('.mobile-button-macro');
        await macroSelect.selectOption('compound');

        // Add two steps
        await page.getByText('+ Dodaj krok').click();
        await page.getByText('+ Dodaj krok').click();

        const steps = configPanel.locator('.border.rounded.mb-2.p-2');

        // Configure step 1 as command "first"
        const step1Select = steps.nth(0).locator('select').first();
        await step1Select.selectOption('command');
        await steps.nth(0).locator('textarea').fill('first');

        // Configure step 2 as command "second"
        const step2Select = steps.nth(1).locator('select').first();
        await step2Select.selectOption('command');
        await steps.nth(1).locator('textarea').fill('second');

        // Move step 2 up (click "^" on step 2)
        const step2UpButton = steps.nth(1).getByRole('button', { name: '^' });
        await step2UpButton.click();

        // Now step 1 should have "second" and step 2 should have "first"
        const newStep1Command = await steps.nth(0).locator('textarea').inputValue();
        const newStep2Command = await steps.nth(1).locator('textarea').inputValue();
        expect(newStep1Command, 'first step should now be "second"').toBe('second');
        expect(newStep2Command, 'second step should now be "first"').toBe('first');
    });

    test('step delete button removes the step', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await openMobileButtonsSettings(page);
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        const button1 = soloPreview.locator('[data-button-id="button-1"]');
        await button1.click();

        const configPanel = page.locator('.mobile-button-config');
        const macroSelect = configPanel.locator('.mobile-button-macro');
        await macroSelect.selectOption('compound');

        // Add two steps
        await page.getByText('+ Dodaj krok').click();
        await page.getByText('+ Dodaj krok').click();
        await expect(page.getByText('Krok 2')).toBeVisible();

        // Delete step 1
        const steps = configPanel.locator('.border.rounded.mb-2.p-2');
        const deleteButton = steps.nth(0).getByRole('button', { name: 'X' });
        await deleteButton.click();

        // Only one step should remain
        await expect(page.getByText('Krok 1')).toBeVisible();
        await expect(page.getByText('Krok 2')).not.toBeVisible();
    });

    test('compound step selector excludes compound and empty options', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await openMobileButtonsSettings(page);
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        const button1 = soloPreview.locator('[data-button-id="button-1"]');
        await button1.click();

        const configPanel = page.locator('.mobile-button-config');
        const macroSelect = configPanel.locator('.mobile-button-macro');
        await macroSelect.selectOption('compound');

        await page.getByText('+ Dodaj krok').click();

        const steps = configPanel.locator('.border.rounded.mb-2.p-2');
        const stepSelect = steps.first().locator('select').first();

        // Check that 'compound' and 'empty' options are not available
        const options = await stepSelect.locator('option').allTextContents();
        expect(options, 'step options should not include compound').not.toContain(expect.stringContaining('wiele akcji'));
        expect(options, 'step options should not include empty').not.toContain('Pusty');
    });
});

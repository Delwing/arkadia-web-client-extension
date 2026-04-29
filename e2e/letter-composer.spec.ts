import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, getLastOutgoingCommand, submitCommand, waitForCommandInput} from './support/mocks';

async function openLetterComposer(page: Page) {
    // Use the /list alias to open the letter composer
    await submitCommand(page, '/list');
    const composer = page.locator('.letter-composer');
    await expect(composer, 'should open letter composer modal').toBeVisible();
    return composer;
}

test.describe('Letter composer', () => {
    test('opens when triggered via /list alias', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const composer = await openLetterComposer(page);

        // Check header is present
        const header = composer.locator('.letter-composer-header');
        await expect(header, 'should have header').toBeVisible();
        await expect(header, 'should show "Nowy list" title').toContainText('Nowy list');

        // Check form fields are present
        await expect(composer.locator('#letter-to'), 'should have "To" field').toBeVisible();
        await expect(composer.locator('#letter-dw'), 'should have "DW" field').toBeVisible();
        await expect(composer.locator('#letter-subject'), 'should have "Subject" field').toBeVisible();
        await expect(composer.locator('#letter-content'), 'should have "Content" field').toBeVisible();
        await expect(composer.locator('#letter-template'), 'should have template selector').toBeVisible();

        // Check buttons are present
        await expect(composer.locator('button:has-text("Podglad")'), 'should have preview button').toBeVisible();
        await expect(composer.locator('button:has-text("Wyslij")'), 'should have submit button').toBeVisible();
    });

    test('form fields work correctly', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const composer = await openLetterComposer(page);

        // Fill in all form fields
        await composer.locator('#letter-to').fill('Gandalf');
        await composer.locator('#letter-dw').fill('Frodo');
        await composer.locator('#letter-subject').fill('Test temat');
        await composer.locator('#letter-content').fill('To jest tresc testowego listu.');

        // Verify values are set
        await expect(composer.locator('#letter-to'), 'should set "To" value').toHaveValue('Gandalf');
        await expect(composer.locator('#letter-dw'), 'should set "DW" value').toHaveValue('Frodo');
        await expect(composer.locator('#letter-subject'), 'should set "Subject" value').toHaveValue('Test temat');
        await expect(composer.locator('#letter-content'), 'should set "Content" value').toHaveValue('To jest tresc testowego listu.');
    });

    test('template selection changes and persists', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const composer = await openLetterComposer(page);

        // Select parchment template
        const templateSelect = composer.locator('#letter-template');
        await templateSelect.selectOption('parchment');
        await expect(templateSelect, 'should select parchment template').toHaveValue('parchment');

        // Close and reopen to verify persistence
        await composer.locator('.btn-close').click();
        await expect(composer, 'should close composer').not.toBeVisible();

        // Reopen
        const reopenedComposer = await openLetterComposer(page);
        await expect(reopenedComposer.locator('#letter-template'), 'should persist template selection').toHaveValue('parchment');
    });

    test('closes on close button click without sending', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const composer = await openLetterComposer(page);

        // Fill in some data
        await composer.locator('#letter-to').fill('Gandalf');
        await composer.locator('#letter-content').fill('Test content');

        // Click close button
        await composer.locator('.btn-close').click();

        // Modal should be closed
        await expect(composer, 'should close composer on close button').not.toBeVisible();

        // No command should have been sent
        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand, 'should not send command on close').toBeNull();
    });

    test('submits letter on form submit', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const composer = await openLetterComposer(page);

        // Fill in form
        await composer.locator('#letter-to').fill('Gandalf');
        await composer.locator('#letter-subject').fill('Pilna wiadomosc');
        await composer.locator('#letter-content').fill('Tresc listu');

        // Submit form
        await composer.locator('button:has-text("Wyslij")').click();

        // Modal should close
        await expect(composer, 'should close composer after submit').not.toBeVisible();

        // Verify "napisz list" command was sent
        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand, 'should send "napisz list" command').not.toBeNull();
    });

    test('submits with Ctrl+Enter shortcut from content area', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const composer = await openLetterComposer(page);

        // Fill in form
        await composer.locator('#letter-to').fill('Gandalf');
        await composer.locator('#letter-subject').fill('Test');
        const contentArea = composer.locator('#letter-content');
        await contentArea.fill('Szybka wiadomosc');

        // Focus content area and press Ctrl+Enter
        await contentArea.focus();
        await page.keyboard.press('Control+Enter');

        // Modal should close
        await expect(composer, 'should close composer on Ctrl+Enter from content area').not.toBeVisible();
    });

    test('submits with Ctrl+Enter shortcut from other fields', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const composer = await openLetterComposer(page);

        // Fill in form
        await composer.locator('#letter-to').fill('Gandalf');
        await composer.locator('#letter-subject').fill('Test');
        await composer.locator('#letter-content').fill('Szybka wiadomosc');

        // Focus "To" field and press Ctrl+Enter
        await composer.locator('#letter-to').focus();
        await page.keyboard.press('Control+Enter');

        // Modal should close
        await expect(composer, 'should close composer on Ctrl+Enter from To field').not.toBeVisible();
    });

    test('preview button keeps composer open', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const composer = await openLetterComposer(page);

        // Fill in content
        await composer.locator('#letter-content').fill('To jest test podgladu listu.');

        // Click preview button
        await composer.locator('button:has-text("Podglad")').click();

        // Composer should still be open after preview
        await expect(composer, 'composer should remain open after preview').toBeVisible();
    });

    test('pin button toggles pinned state', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const composer = await openLetterComposer(page);

        const pinButton = composer.locator('.window-pin-button');
        await expect(pinButton, 'should have pin button').toBeVisible();

        // Initially not pinned
        await expect(pinButton, 'should not be active initially').not.toHaveClass(/window-pin-button--active/);

        // Click to pin
        await pinButton.click();
        await expect(pinButton, 'should be active after clicking').toHaveClass(/window-pin-button--active/);

        // Click again to unpin
        await pinButton.click();
        await expect(pinButton, 'should not be active after second click').not.toHaveClass(/window-pin-button--active/);
    });

    test('resets form after submission', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        let composer = await openLetterComposer(page);

        // Fill in form
        await composer.locator('#letter-to').fill('Gandalf');
        await composer.locator('#letter-dw').fill('Frodo');
        await composer.locator('#letter-subject').fill('Test');
        await composer.locator('#letter-content').fill('Content');

        // Submit form
        await composer.locator('button:has-text("Wyslij")').click();
        await expect(composer, 'should close composer after submit').not.toBeVisible();

        // Reopen composer
        composer = await openLetterComposer(page);

        // All fields should be empty
        await expect(composer.locator('#letter-to'), 'should reset "To" field').toHaveValue('');
        await expect(composer.locator('#letter-dw'), 'should reset "DW" field').toHaveValue('');
        await expect(composer.locator('#letter-subject'), 'should reset "Subject" field').toHaveValue('');
        await expect(composer.locator('#letter-content'), 'should reset "Content" field').toHaveValue('');
    });
});

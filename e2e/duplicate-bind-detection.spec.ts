import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getLastOutgoingCommand,
    pushText,
    resetCommandLog,
    waitForCommandInput,
} from './support/mocks';
import type {Page} from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openBindsModal(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#binds-button');
    await page.waitForSelector('#binds-modal.show', {timeout: 5000});
    await page.waitForSelector('#binds-modal .form-select', {timeout: 5000});
}

async function closeBindsModal(page: Page): Promise<void> {
    await page.locator('#binds-modal .btn-close').first().click();
    await page.waitForSelector('#binds-modal.show', {state: 'hidden', timeout: 5000});
}

async function saveAndCloseBindsModal(page: Page): Promise<void> {
    await page.locator('#binds-modal button:has-text("Zapisz")').click();
    await page.waitForSelector('#binds-modal.show', {state: 'hidden', timeout: 5000});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Functional bind categories with separate keys', () => {
    // -----------------------------------------------------------------------
    // 1. Gates category uses a separate key when configured via localStorage
    // -----------------------------------------------------------------------

    test('gates category uses its own key when mainGates is configured separately', async ({page}) => {
        // Seed localStorage before the page boots so the Client constructor reads
        // the configured bind for the gates category (mainGates = Backslash)
        await page.addInitScript(() => {
            const binds = {
                main:      {key: 'BracketRight'},
                mainGates: {key: 'Backslash'},
            };
            // Write to the keymaps store so keymapStorage picks it up
            const keymapStore = {
                version: 1,
                keymaps: {
                    'default': {
                        id: 'default',
                        name: 'Domyslna',
                        binds,
                        createdAt: new Date().toISOString(),
                    },
                },
            };
            localStorage.setItem('keymaps', JSON.stringify(keymapStore));
            localStorage.setItem('active_keymap_id', '"default"');
            localStorage.setItem('binds', JSON.stringify(binds));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger default category (seat prompt)
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Trigger gates category
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        // Press the default key (]) — should fire the default (seat) category
        // because gates is on a different key
        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {timeout: 3000})
            .toBe('usiadz');

        // Press the gates key (\) — should fire the gates category
        await resetCommandLog(page);
        await page.keyboard.press('Backslash');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {timeout: 3000})
            .toBe('uderz we wrota');
    });

    // -----------------------------------------------------------------------
    // 2. Transport category uses a separate key when configured via localStorage
    // -----------------------------------------------------------------------

    test('transport category uses its own key when mainTransport is configured separately', async ({page}) => {
        await page.addInitScript(() => {
            const binds = {
                main:           {key: 'BracketRight'},
                mainTransport:  {key: 'BracketLeft'},
            };
            const keymapStore = {
                version: 1,
                keymaps: {
                    'default': {
                        id: 'default',
                        name: 'Domyslna',
                        binds,
                        createdAt: new Date().toISOString(),
                    },
                },
            };
            localStorage.setItem('keymaps', JSON.stringify(keymapStore));
            localStorage.setItem('active_keymap_id', '"default"');
            localStorage.setItem('binds', JSON.stringify(binds));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger default category (seat prompt)
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Trigger transport category via standing pattern (room.contents.object GMCP)
        await pushText(page, 'czarny stojacy dylizans', { type: 'room.contents.object' });
        await expect(output).toContainText('bind');

        // Press the default key (]) — should fire the default (seat) category only
        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {timeout: 3000})
            .toBe('usiadz');

        // Press the transport key ([) — should fire the transport category
        await resetCommandLog(page);
        await page.keyboard.press('BracketLeft');
        await expect.poll(async () => {
            const cmds = await getCommandLog(page);
            return cmds.includes('wsiadz do dylizansu');
        }, {timeout: 3000}).toBe(true);
    });
});

test.describe('Duplicate key assignment in Binds modal', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    // -----------------------------------------------------------------------
    // 3. UI allows the same key to be assigned to two different binds without
    //    error or warning
    // -----------------------------------------------------------------------

    test('assigning the same key to two different bind rows saves without error', async ({page}) => {
        await openBindsModal(page);

        // Locate the "Tymczasowe 1" and "Tymczasowe 2" row inputs by their
        // preceding label text.  Both are readOnly Form.Controls that capture
        // keys on keydown.
        const temp1Input = page
            .locator('#binds-modal tr', {hasText: 'Tymczasowe 1'})
            .locator('input[type="text"]');
        const temp2Input = page
            .locator('#binds-modal tr', {hasText: 'Tymczasowe 2'})
            .locator('input[type="text"]');

        await expect(temp1Input).toBeVisible();
        await expect(temp2Input).toBeVisible();

        // Assign F8 to Tymczasowe 1
        await temp1Input.focus();
        await page.keyboard.press('F8');
        await page.waitForTimeout(100);

        // Assign the same F8 to Tymczasowe 2
        await temp2Input.focus();
        await page.keyboard.press('F8');
        await page.waitForTimeout(100);

        // Both inputs should now show "F8"
        await expect(temp1Input).toHaveValue('F8');
        await expect(temp2Input).toHaveValue('F8');

        // Save — no error alert should appear
        await saveAndCloseBindsModal(page);

        // Verify the modal is gone (saved without complaint)
        await expect(page.locator('#binds-modal')).not.toBeVisible();

        // Reopen and verify both binds still show F8
        await openBindsModal(page);

        const temp1After = page
            .locator('#binds-modal tr', {hasText: 'Tymczasowe 1'})
            .locator('input[type="text"]');
        const temp2After = page
            .locator('#binds-modal tr', {hasText: 'Tymczasowe 2'})
            .locator('input[type="text"]');

        await expect(temp1After).toHaveValue('F8');
        await expect(temp2After).toHaveValue('F8');

        await closeBindsModal(page);
    });
});

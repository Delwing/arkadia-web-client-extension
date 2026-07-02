import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    pushGmcp,
    GMCP_PATHS,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
} from './support/mocks';

async function openAliasesModal(page: Page) {
    await page.click('#menu-button');
    await page.click('#aliases-button');
    const modal = page.locator('#aliases-modal');
    await expect(modal, 'should display aliases modal after navigation').toBeVisible();
    return modal;
}

test.describe('User aliases', () => {
    test('creates, executes, and persists custom alias', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const aliasesModal = await openAliasesModal(page);

        const aliasEntries = aliasesModal.locator('.alias-card');
        await expect(aliasEntries, 'should start with no custom aliases').toHaveCount(0);

        await aliasesModal.getByRole('button', { name: 'Dodaj alias' }).click();

        const patternInput = aliasesModal.getByPlaceholder('np. zab (.+)');
        const commandInput = aliasesModal.getByPlaceholder('np. zabij $1');
        const aliasPattern = 'fooalias';
        const aliasCommand = 'powiedz czesc';

        await patternInput.fill(aliasPattern);
        await commandInput.fill(aliasCommand);
        await aliasesModal.getByRole('button', { name: 'Dodaj', exact: true }).click();

        const createdAlias = aliasesModal.locator('.alias-card').filter({ hasText: aliasPattern });
        await expect(createdAlias, 'should list newly created alias entry').toContainText(aliasCommand);

        await aliasesModal.locator('.btn-close').click();
        await expect(aliasesModal, 'should close aliases modal before executing commands').not.toBeVisible();

        await submitCommand(page, aliasPattern);
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send mapped command for newly created alias',
            })
            .toBe(aliasCommand);

        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const reloadedModal = await openAliasesModal(page);
        const persistedAlias = reloadedModal.locator('.alias-card').filter({ hasText: aliasPattern });
        await expect(persistedAlias, 'should persist alias entry after reload').toContainText(aliasCommand);

        await reloadedModal.locator('.btn-close').click();
        await expect(reloadedModal, 'should close aliases modal after persistence check').not.toBeVisible();

        await submitCommand(page, aliasPattern);
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should execute persisted alias after reload',
            })
            .toBe(aliasCommand);
    });

    test('executes character-specific override command', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Establish two characters via GMCP so they appear in the override dropdown.
        // Pushing char.info with object_num creates CharName:object_num in localStorage,
        // which collectCharacters() uses to discover known characters.
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharBeta', object_num: 91002});
        await waitForCharacter(page, 'CharBeta');

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharAlpha', object_num: 91001});
        await waitForCharacter(page, 'CharAlpha');

        const aliasesModal = await openAliasesModal(page);

        // Open the add alias form
        await aliasesModal.getByRole('button', {name: 'Dodaj alias'}).click();

        // Fill in the pattern and default command
        await aliasesModal.getByPlaceholder('np. zab (.+)').fill('testalias');
        await aliasesModal.getByPlaceholder('np. zabij $1').fill('default cmd');

        // Add a character override for CharAlpha:
        // The select defaults to the first available character; CharAlpha should be present
        await aliasesModal.locator('select').selectOption('CharAlpha');

        // Click the override "Dodaj" button (btn-outline-secondary, inside the modal body)
        await aliasesModal.locator('button.btn-outline-secondary', {hasText: 'Dodaj'}).click();

        // Fill the override command input that appeared
        await aliasesModal.getByPlaceholder('Komenda dla tej postaci').fill('alpha cmd');

        // Save the alias using the primary "Dodaj" button in the modal footer
        await aliasesModal.locator('.modal-footer .btn-primary').click();

        // Verify the alias card shows the override entry for CharAlpha
        const aliasCard = aliasesModal.locator('.alias-card').filter({hasText: 'testalias'});
        await expect(aliasCard, 'should list newly created alias with override').toBeVisible();

        const overrideEntry = aliasCard.locator('.alias-override-entry');
        await expect(
            overrideEntry.locator('.alias-override-char'),
            'should show CharAlpha as the override character',
        ).toContainText('CharAlpha');
        await expect(
            overrideEntry.locator('.alias-command'),
            'should show alpha cmd as the override command',
        ).toContainText('alpha cmd');

        // Close the aliases modal
        await aliasesModal.locator('.btn-close').first().click();
        await expect(aliasesModal, 'should close aliases modal before executing commands').not.toBeVisible();

        // Execute the alias as CharAlpha — expect the override command to be sent
        await submitCommand(page, 'testalias');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send CharAlpha override command when active character has an override',
            })
            .toBe('alpha cmd');

        // Switch to CharBeta — no override exists, so the default command should be sent
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharBeta', object_num: 91002});
        await waitForCharacter(page, 'CharBeta');

        await submitCommand(page, 'testalias');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send default command when active character has no override',
            })
            .toBe('default cmd');

        // Reload to verify the override persists across page loads
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Switch back to CharAlpha after reload
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharAlpha', object_num: 91001});
        await waitForCharacter(page, 'CharAlpha');

        // Open the aliases modal and confirm the override was persisted
        const reloadedModal = await openAliasesModal(page);
        const reloadedCard = reloadedModal.locator('.alias-card').filter({hasText: 'testalias'});
        await expect(reloadedCard, 'should persist alias card after reload').toBeVisible();

        const reloadedOverride = reloadedCard.locator('.alias-override-entry');
        await expect(
            reloadedOverride.locator('.alias-override-char'),
            'should persist CharAlpha override character after reload',
        ).toContainText('CharAlpha');
        await expect(
            reloadedOverride.locator('.alias-command'),
            'should persist alpha cmd override command after reload',
        ).toContainText('alpha cmd');

        await reloadedModal.locator('.btn-close').first().click();
        await expect(reloadedModal, 'should close aliases modal after persistence check').not.toBeVisible();
    });
});

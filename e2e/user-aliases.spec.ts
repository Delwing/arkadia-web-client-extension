import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    submitCommand,
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

        const aliasEntries = aliasesModal.locator('.alias-list-item');
        await expect(aliasEntries, 'should start with no custom aliases').toHaveCount(0);

        await aliasesModal.getByRole('button', { name: 'Dodaj alias' }).click();

        const patternInput = aliasesModal.getByPlaceholder('np. ^zab (.+)$');
        const commandInput = aliasesModal.getByPlaceholder('np. zabij $1');
        const aliasPattern = 'fooalias';
        const aliasCommand = 'powiedz czesc';

        await patternInput.fill(aliasPattern);
        await commandInput.fill(aliasCommand);
        await aliasesModal.getByRole('button', { name: 'Dodaj', exact: true }).click();

        const createdAlias = aliasesModal.locator('.alias-list-item').filter({ hasText: aliasPattern });
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
        const persistedAlias = reloadedModal.locator('.alias-list-item').filter({ hasText: aliasPattern });
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
});

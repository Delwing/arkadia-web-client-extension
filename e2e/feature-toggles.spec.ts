import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, submitCommand, waitForCommandInput, getRecentOutput} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const FEATURES_BUTTON = '#features-button';
const FEATURES_MODAL = '#features-modal';

async function openFeatures(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(FEATURES_BUTTON);
    const modal = page.locator(FEATURES_MODAL);
    await expect(modal, 'should show the features modal').toBeVisible();
    return modal;
}

/**
 * The switch for one script, by id.
 *
 * Not by label: a blocked row carries its dependency's title in a "wymaga:"
 * badge, so matching on text picks up the dependant as well as the dependency.
 */
function switchFor(modal: ReturnType<Page['locator']>, id: string) {
    return rowFor(modal, id).locator('input[type="checkbox"]');
}

/** The whole row for one script, for asserting what it says. */
function rowFor(modal: ReturnType<Page['locator']>, id: string) {
    return modal.locator(`.features-row[data-script="${id}"]`);
}

test.describe('Feature toggles', () => {
    test('lists the scripts and shows them all running', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);

        const modal = await openFeatures(page);

        // The catalog labels every registered script, so the list is the full set.
        await expect(modal.locator('.features-row')).toHaveCount(148);
        await expect(switchFor(modal, 'kill')).toBeChecked();
    });

    test('turning a feature off takes its aliases with it', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // /zabici belongs to the kill script's scope, so it answers while it runs.
        await submitCommand(page, '/zabici');
        expect(await getRecentOutput(page, 20), 'the alias is recognised')
            .not.toContain('Nieznany alias');

        const modal = await openFeatures(page);
        await switchFor(modal, 'kill').uncheck();
        await expect(switchFor(modal, 'kill')).not.toBeChecked();
        await page.locator(`${FEATURES_MODAL} .btn-close`).click();
        await expect(page.locator(FEATURES_MODAL)).not.toBeVisible();

        await submitCommand(page, '/zabici');

        // Nothing claims the alias any more, so the client reports it as unknown.
        // That message is the observable proof the scope was torn down — an
        // unmatched /alias is never forwarded to the game.
        expect(await getRecentOutput(page, 20)).toContain('Nieznany alias');
    });

    test('the choice survives a reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);

        let modal = await openFeatures(page);
        await switchFor(modal, 'kill').uncheck();

        await page.reload();
        await waitForCommandInput(page);

        modal = await openFeatures(page);
        await expect(switchFor(modal, 'kill')).not.toBeChecked();
    });

    test('turning it back on starts it again', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openFeatures(page);
        await switchFor(modal, 'kill').uncheck();
        await switchFor(modal, 'kill').check();
        await expect(switchFor(modal, 'kill')).toBeChecked();
        await page.locator(`${FEATURES_MODAL} .btn-close`).click();
        await expect(page.locator(FEATURES_MODAL)).not.toBeVisible();

        await submitCommand(page, '/zabici');

        expect(await getRecentOutput(page, 20), 'the alias answers again')
            .not.toContain('Nieznany alias');
    });

    test('a dependant is disabled and locked when its dependency goes', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);

        const modal = await openFeatures(page);
        await switchFor(modal, 'shortcuts').uncheck();

        // idz requires shortcuts, so it stops too — and its switch is locked,
        // because the one that needs turning back on is the dependency's.
        const dependant = rowFor(modal, 'idz');
        await expect(switchFor(modal, 'idz')).not.toBeChecked();
        await expect(switchFor(modal, 'idz')).toBeDisabled();
        await expect(dependant, 'says what it is waiting for').toContainText('wymaga: Skróty lokacji');

        await switchFor(modal, 'shortcuts').check();

        await expect(switchFor(modal, 'idz')).toBeChecked();
        await expect(switchFor(modal, 'idz')).toBeEnabled();
    });

    test('the search box narrows the list', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);

        const modal = await openFeatures(page);
        await modal.getByPlaceholder('Szukaj funkcji…').fill('zabit');

        await expect(modal.locator('.features-row')).toHaveCount(1);
        await expect(modal.locator('.features-row'), 'found by its Polish label, not its module name')
            .toContainText('Licznik zabitych');
    });
});

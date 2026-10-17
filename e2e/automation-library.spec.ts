import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';
import {closeAutomation, openAutomation, row} from './support/automation';

test.describe('Automation library', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('a recipe is added once and opens in the editor', async ({page}) => {
        const modal = await openAutomation(page);
        await modal.locator('.automation-nav__library').click();

        const recipe = modal.locator('[data-recipe="mail-unreceived-sound"]');
        await expect(recipe, 'should offer the mail sound').toContainText('Dźwięk na nieodebraną pocztę');
        await recipe.getByRole('button', {name: 'Dodaj'}).click();
        await expect(modal.locator('.automation-notice'), 'should say where it went').toContainText('do grupy Dźwięki');
        await expect(recipe.getByRole('button', {name: 'Dodaj'}), 'should not offer it twice').toHaveCount(0);
        await expect(recipe, 'should show it as added').toContainText('Dodano');

        await page.screenshot({path: 'test-results/automation-library.png'});

        await recipe.getByRole('button', {name: 'Pokaż'}).click();
        await expect(modal.locator('.automation-library'), 'should go back to the list').toHaveCount(0);
        await expect(row(modal, 'Dźwięk na nieodebraną pocztę'), 'should list the added trigger').toHaveClass(/is-selected/);
        await expect(modal.locator('.automation-group', {hasText: 'Dźwięki'}), 'should put it in its group').toBeVisible();
        await expect(modal.locator('.automation-editor__name'), 'should open it in the editor').toHaveValue('Dźwięk na nieodebraną pocztę');

        await closeAutomation(modal);
    });

    test('Pokaż scrolls a long list to the added recipe', async ({page}) => {
        // A full group ahead of the one the recipe lands in pushes it below the fold.
        const aliases = Array.from({length: 40}, (_, i) => ({id: `a${i}`, pattern: `walka${i}`, command: `zabij ${i}`, group: 'walka'}));
        await page.evaluate(list => {
            localStorage.setItem('automationGroups', JSON.stringify([{id: 'walka', name: 'Walka'}]));
            localStorage.setItem('aliases', JSON.stringify(list));
        }, aliases);

        const modal = await openAutomation(page);
        await modal.locator('.automation-nav__library').click();
        const recipe = modal.locator('[data-recipe="attack-sound"]');
        await recipe.getByRole('button', {name: 'Dodaj'}).click();
        await recipe.getByRole('button', {name: 'Pokaż'}).click();

        await expect(row(modal, 'Dźwięk na każdy atak'), 'should select the added trigger').toHaveClass(/is-selected/);
        await expect(row(modal, 'Dźwięk na każdy atak'), 'should scroll the list to it').toBeInViewport();
        await expect(row(modal, 'walka0'), 'should have scrolled past the top').not.toBeInViewport();
    });
});

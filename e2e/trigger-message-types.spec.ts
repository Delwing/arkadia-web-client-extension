import {expect, test} from './support/fixtures';
import {ensureGameSocket, primeCharInfo, pushText, waitForCommandInput, waitForOutputContaining} from './support/mocks';
import {closeAutomation, openAutomation, row, saveEditor, startNew} from './support/automation';

test('a pattern trigger limited to several message types runs on each of them only', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);

    const modal = await openAutomation(page);
    await startNew(page, modal, 'trigger');
    await modal.getByTitle('Wzorzec', {exact: true}).fill('tarcze');
    await modal.getByRole('button', {name: 'Dodaj akcję'}).click();
    await modal.locator('.automation-act').last().locator('select').first().selectOption('uppercase');

    const picker = modal.getByRole('button', {name: 'dowolnych wiadomościach'});
    await picker.click();
    await page.getByLabel('Długi opis żywej istoty').check();
    await page.getByLabel('Długi opis obiektu').check();
    await expect(modal.locator('.automation-msgtype'), 'should name both picked types')
        .toContainText('Długi opis żywej istoty, Długi opis obiektu');
    await modal.getByTitle('Wzorzec', {exact: true}).click();
    await saveEditor(modal);
    await expect(row(modal, 'tarcze')).toBeVisible();
    await closeAutomation(modal);

    // Looking at one creature is living.long, at several of them object.long.
    await pushText(page, 'Ma na sobie okragla tarcze.', {type: 'living.long'});
    await pushText(page, 'Ma na sobie trojkatna tarcze.', {type: 'object.long'});
    await pushText(page, 'Mowi: rzuc tarcze.', {type: 'comm'});

    await waitForOutputContaining(page, 'okragla TARCZE');
    await waitForOutputContaining(page, 'trojkatna TARCZE');
    await waitForOutputContaining(page, 'rzuc tarcze');
});

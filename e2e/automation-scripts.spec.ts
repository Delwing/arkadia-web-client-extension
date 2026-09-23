import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    resetCommandLog,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';
import {closeAutomation, fillScriptCode, openAutomation, row, rowTitled, saveEditor, startNew} from './support/automation';

const CODE = `log('cel', args[0]);
await send('zabij ' + args[0]);`;

test.describe('Automation scripts', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('a script runs from its command and logs to its console', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'script');
        await modal.getByTitle('Nazwa (opcjonalna)').fill('atak');
        await modal.getByTitle('Komenda', {exact: true}).fill('atak');
        await fillScriptCode(page, modal, CODE);

        // Run from the editor, before saving.
        await modal.getByRole('button', {name: 'Uruchom'}).click();
        await expect(modal.locator('.automation-console__line.is-log'), 'should log from the draft run').toContainText('cel');

        await saveEditor(modal);
        await expect(rowTitled(modal, 'atak'), 'should list the script with its command').toContainText('/atak');
        await closeAutomation(modal);

        await resetCommandLog(page);
        await submitCommand(page, '/atak goblina');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {message: 'should send what the script sends'})
            .toBe('zabij goblina');

        const reopened = await openAutomation(page);
        await rowTitled(reopened, 'atak').locator('.automation-item__main').click();
        await expect(reopened.locator('.automation-console'), 'should show what the run sent').toContainText('zabij goblina');
    });

    test('an alias runs a script with its groups', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'script');
        await modal.getByTitle('Nazwa (opcjonalna)').fill('atak');
        await fillScriptCode(page, modal, CODE);
        await saveEditor(modal);

        await startNew(page, modal, 'alias');
        await modal.getByPlaceholder('np. zab (.+)').fill('za (.+)');
        const action = modal.locator('.automation-act').first();
        await action.locator('select').first().selectOption('script');
        await expect(action.getByTitle('Skrypt'), 'should pick the only script').toHaveValue(/.+/);
        await saveEditor(modal);

        await expect(row(modal, 'za (.+)'), 'should name the script in the summary').toContainText('skrypt atak');
        await expect(rowTitled(modal, 'atak'), 'should count who uses the script').toContainText('uzywany przez 1 element');
        await closeAutomation(modal);

        await resetCommandLog(page);
        await submitCommand(page, 'za orka');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {message: 'should pass $1 to the script'})
            .toBe('zabij orka');
    });
});

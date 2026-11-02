import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    primeCharInfo,
    pushText,
    resetCommandLog,
    waitForCommandInput,
} from './support/mocks';
import {addPatternTrigger, closeAutomation, openAutomation, row, rowTitled, saveEditor, startNew} from './support/automation';

test.describe('Automation timers', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('a one-off timer sends its command once the character is in the game', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'timer');
        await modal.getByTitle('Nazwa (opcjonalna)').fill('woda');
        await modal.getByText('Raz, po czasie').click();
        await modal.getByTitle('Sekundy', {exact: true}).fill('2');
        await modal.getByTitle('Minuty', {exact: true}).fill('');
        await modal.getByPlaceholder('np. napij sie wody').fill('napij sie wody');
        await saveEditor(modal);

        await expect(rowTitled(modal, 'woda'), 'should describe when the timer runs').toContainText('raz po 2 s');
        await expect(rowTitled(modal, 'woda'), 'should list what the timer does').toContainText('napij sie wody');
        await closeAutomation(modal);

        await resetCommandLog(page);
        await primeCharInfo(page);
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {message: 'should send the command after the delay', timeout: 10_000})
            .toBe('napij sie wody');
    });

    test('a trigger starts a timer that waits for an action', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'timer');
        await modal.getByTitle('Nazwa (opcjonalna)').fill('woda');
        await modal.getByText('Raz, po czasie').click();
        await modal.getByText('Akcją z triggera lub aliasu').click();
        await modal.getByTitle('Sekundy', {exact: true}).fill('1');
        await modal.getByTitle('Minuty', {exact: true}).fill('');
        await modal.getByPlaceholder('np. napij sie wody').fill('napij sie wody');
        await saveEditor(modal);
        await expect(rowTitled(modal, 'woda'), 'should say nothing starts it yet').toContainText('nikt go nie uruchamia');

        await addPatternTrigger(page, modal, 'Chce ci sie pic', async action => {
            await action.locator('select').first().selectOption('timer');
            await expect(action.getByTitle('Timer', {exact: true}), 'should pick the only timer').toHaveValue(/.+/);
        });
        await expect(row(modal, 'Chce ci sie pic'), 'should name the timer in the summary').toContainText('uruchom timer woda');
        await expect(rowTitled(modal, 'woda'), 'should count who starts it').toContainText('uruchamiany przez 1 element');
        await closeAutomation(modal);

        await resetCommandLog(page);
        await primeCharInfo(page);
        // Not started yet: logging in alone must not run it.
        await page.waitForTimeout(1_500);
        expect(await getLastOutgoingCommand(page), 'should wait for the trigger').not.toBe('napij sie wody');

        await pushText(page, 'Chce ci sie pic.');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {message: 'should send the command a second after the line'})
            .toBe('napij sie wody');
    });

    test('takes hours, minutes and seconds together and shows them split again', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'timer');
        await modal.getByTitle('Nazwa (opcjonalna)').fill('dlugi');
        await modal.getByTitle('Godziny', {exact: true}).fill('1');
        await modal.getByTitle('Minuty', {exact: true}).fill('90');
        await modal.getByTitle('Sekundy', {exact: true}).fill('15');
        await modal.getByPlaceholder('np. napij sie wody').fill('x');
        await saveEditor(modal);
        await expect(rowTitled(modal, 'dlugi'), 'should add the fields up').toContainText('co 2 h 30 min 15 s');

        // Reopened, the 90 minutes come back as whole hours and minutes.
        await closeAutomation(modal);
        const reopened = await openAutomation(page);
        await rowTitled(reopened, 'dlugi').locator('.automation-item__main').click();
        await expect(reopened.getByTitle('Godziny', {exact: true})).toHaveValue('2');
        await expect(reopened.getByTitle('Minuty', {exact: true})).toHaveValue('30');
        await expect(reopened.getByTitle('Sekundy', {exact: true})).toHaveValue('15');
    });

    test('refuses an interval shorter than a second', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'timer');
        await modal.getByTitle('Sekundy', {exact: true}).fill('0,5');
        await modal.getByTitle('Minuty', {exact: true}).fill('');
        await modal.getByPlaceholder('np. napij sie wody').fill('x');
        await modal.locator('.automation-editor__foot').getByRole('button', {name: 'Zapisz', exact: true}).click();
        await expect(modal.locator('.automation-error'), 'should explain the allowed range').toContainText('od 1 s do 24 h');
    });
});

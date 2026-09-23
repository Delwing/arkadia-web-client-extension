import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getLastOutgoingCommand,
    pushGmcp,
    resetCommandLog,
    GMCP_PATHS,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
} from './support/mocks';
import {addAlias, closeAutomation, openAutomation, row, saveEditor, selectRow, startNew} from './support/automation';

test.describe('User aliases', () => {
    test('creates, executes, and persists custom alias', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openAutomation(page);
        await expect(modal.locator('.automation-item'), 'should start with no aliases or triggers').toHaveCount(0);

        const aliasPattern = 'fooalias';
        const aliasCommand = 'powiedz czesc';
        await addAlias(page, modal, aliasPattern, aliasCommand);
        await expect(row(modal, aliasPattern), 'should list newly created alias entry').toContainText(aliasCommand);

        await closeAutomation(modal);
        await submitCommand(page, aliasPattern);
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send mapped command for newly created alias',
            })
            .toBe(aliasCommand);

        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const reloaded = await openAutomation(page);
        await expect(row(reloaded, aliasPattern), 'should persist alias entry after reload').toContainText(aliasCommand);
        await closeAutomation(reloaded);

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

        // Pushing char.info with object_num creates CharName:object_num in localStorage,
        // which collectCharacters() uses to discover known characters.
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharBeta', object_num: 91002});
        await waitForCharacter(page, 'CharBeta');
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharAlpha', object_num: 91001});
        await waitForCharacter(page, 'CharAlpha');

        const modal = await openAutomation(page);
        await startNew(page, modal, 'alias');
        await modal.getByPlaceholder('np. zab (.+)').fill('testalias');
        await modal.getByPlaceholder('np. zabij $1').fill('default cmd');

        await modal.locator('select.automation-override__select').selectOption('CharAlpha');
        await modal.getByRole('button', {name: 'Dodaj dla postaci'}).click();
        await modal.getByPlaceholder('Komenda dla tej postaci').fill('alpha cmd');
        await saveEditor(modal);

        await expect(row(modal, 'testalias'), 'should list the alias').toBeVisible();
        await closeAutomation(modal);

        await submitCommand(page, 'testalias');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send CharAlpha override command when active character has an override',
            })
            .toBe('alpha cmd');

        // No override for CharBeta, so the default command goes.
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharBeta', object_num: 91002});
        await waitForCharacter(page, 'CharBeta');
        await submitCommand(page, 'testalias');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send default command when active character has no override',
            })
            .toBe('default cmd');

        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharAlpha', object_num: 91001});
        await waitForCharacter(page, 'CharAlpha');

        const reloaded = await openAutomation(page);
        await selectRow(reloaded, 'testalias');
        await expect(
            reloaded.getByTitle('Komenda dla CharAlpha'),
            'should persist the CharAlpha override after reload',
        ).toHaveValue('alpha cmd');
        await closeAutomation(reloaded);
    });

    test('runs several actions, shows its group and stops when switched off', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openAutomation(page);
        await startNew(page, modal, 'alias');
        await modal.getByPlaceholder('np. zab (.+)').fill('zabx (.+)');
        await modal.getByPlaceholder('np. zabij $1').fill('zabij $1');
        await modal.getByRole('button', {name: 'Dodaj akcję'}).click();
        await modal.getByPlaceholder('np. zabij $1').nth(1).fill('zapal pochodnie');
        await modal.getByTitle('Grupa', {exact: true}).fill('Walka');

        // The test line shows what the alias would send before it is saved.
        await modal.getByTitle('Przykladowa komenda').fill('zabx goblina');
        await expect(modal.locator('.automation-out'), 'should preview the commands').toContainText('zabij goblina');
        await expect(modal.locator('.automation-out'), 'should preview the commands').toContainText('zapal pochodnie');
        await saveEditor(modal);

        const group = modal.locator('.automation-section').filter({has: page.locator('.automation-group', {hasText: 'Walka'})});
        await expect(group.locator('.automation-item'), 'should put the alias in its group').toContainText('zabij $1 ; zapal pochodnie');

        await closeAutomation(modal);
        await resetCommandLog(page);
        await submitCommand(page, 'zabx goblina');
        await expect
            .poll(async () => await getCommandLog(page), {message: 'should send every command action in order'})
            .toEqual(expect.arrayContaining(['zabij goblina', 'zapal pochodnie']));

        const reopened = await openAutomation(page);
        await row(reopened, 'zabx').getByTitle('Wlaczony').click();
        await expect(row(reopened, 'zabx'), 'should mark the alias as switched off').toHaveClass(/is-off/);

        await closeAutomation(reopened);
        await resetCommandLog(page);
        await submitCommand(page, 'zabx orka');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {message: 'should send the typed text unchanged'})
            .toBe('zabx orka');
        expect(await getCommandLog(page)).not.toContain('zabij orka');
    });

    test('a switched off group stops its aliases', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openAutomation(page);
        await startNew(page, modal, 'alias');
        await modal.getByPlaceholder('np. zab (.+)').fill('grx');
        await modal.getByPlaceholder('np. zabij $1').fill('powiedz grupa');
        await modal.getByTitle('Grupa', {exact: true}).fill('Handel');
        await saveEditor(modal);

        await modal.locator('.automation-group', {hasText: 'Handel'}).getByTitle('Grupa wlaczona').click();
        await expect(modal.locator('.automation-group', {hasText: 'Handel'}), 'should show the group as off').toContainText('wylaczona');
        await closeAutomation(modal);

        await resetCommandLog(page);
        await submitCommand(page, 'grx');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {message: 'should not run an alias of a group that is off'})
            .toBe('grx');
    });
});

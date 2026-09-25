import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getLastOutgoingCommand,
    primeCharInfo,
    pushGmcp,
    pushText,
    resetCommandLog,
    waitForCommandInput,
} from './support/mocks';
import {addGroup, addPatternTrigger, closeAutomation, openAutomation, row, saveEditor, startNew, startNewInGroup} from './support/automation';

test('User trigger creation executes command and persists after reload', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);

    const modal = await openAutomation(page);
    await addPatternTrigger(page, modal, 'Trigger test', async action => {
        await action.locator('select').first().selectOption('command');
        await action.getByPlaceholder('Command').fill('say triggered');
    });

    await expect(row(modal, 'Trigger test'), 'should list the trigger with its command').toContainText('say triggered');
    await closeAutomation(modal);

    await resetCommandLog(page);
    await pushText(page, 'Trigger test incoming!');
    await expect
        .poll(async () => await getLastOutgoingCommand(page), {message: 'should send command macro when trigger matches'})
        .toBe('say triggered');

    await page.reload();
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await resetCommandLog(page);

    const reloaded = await openAutomation(page);
    await expect(row(reloaded, 'Trigger test'), 'should preserve the trigger after reload').toContainText('say triggered');
    await closeAutomation(reloaded);

    await pushText(page, 'Trigger test incoming again!');
    await expect
        .poll(async () => await getLastOutgoingCommand(page), {message: 'should keep executing macro after reload'})
        .toBe('say triggered');
});

test('pattern trigger fills $1 from the match and previews it on a test line', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);

    const modal = await openAutomation(page);
    await startNew(page, modal, 'trigger');
    await modal.getByTitle('Wzorzec', {exact: true}).fill('^(\\w+) atakuje cie');
    await modal.getByRole('button', {name: 'Dodaj akcję'}).click();
    const action = modal.locator('.automation-act').last();
    await action.locator('select').first().selectOption('command');
    await action.getByPlaceholder('Command').fill('zabij $1');

    await modal.getByTitle('Linia do testu').fill('Goblin atakuje cie!');
    await expect(modal.locator('.automation-test'), 'should show the match and its group').toContainText('$1 = Goblin');
    await expect(modal.locator('.automation-out'), 'should preview the command').toContainText('zabij Goblin');
    await saveEditor(modal);
    await closeAutomation(modal);

    await resetCommandLog(page);
    await pushText(page, 'Ork atakuje cie!');
    await expect
        .poll(async () => await getLastOutgoingCommand(page), {message: 'should send the command with the group filled in'})
        .toBe('zabij Ork');
});

test('colour action sets a background with an empty text swatch', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);

    const modal = await openAutomation(page);
    await startNew(page, modal, 'trigger');
    await modal.getByTitle('Wzorzec', {exact: true}).fill('ognisty smok');
    await modal.getByRole('button', {name: 'Dodaj akcję'}).click();
    const action = modal.locator('.automation-act').last();
    await action.locator('select').first().selectOption('color');

    const [text, background] = [action.locator('.color-slot').nth(0), action.locator('.color-slot').nth(1)];
    await expect(text, 'text colour starts set').not.toHaveClass(/is-empty/);
    await expect(background, 'background starts empty').toHaveClass(/is-empty/);

    await background.locator('input[type="color"]').fill('#004080');
    await expect(background, 'picking a colour fills the swatch').not.toHaveClass(/is-empty/);
    const bgSwatch = background.locator('input[type="color"]');
    const before = await bgSwatch.boundingBox();
    await text.getByTitle('Bez koloru').click();
    await expect(text, 'x clears the text colour').toHaveClass(/is-empty/);
    expect((await bgSwatch.boundingBox())?.x, 'clearing a colour does not shift the row').toBe(before?.x);

    await modal.getByTitle('Linia do testu').fill('Widzisz ognisty smok.');
    await expect(modal.locator('.automation-out__match'), 'preview shows the background')
        .toHaveCSS('background-color', 'rgb(0, 64, 128)');
    await saveEditor(modal);
    await closeAutomation(modal);

    await pushText(page, 'Nad toba leci ognisty smok!');
    const match = page.locator('#main_text_output_msg_wrapper span', {hasText: /^ognisty smok$/}).last();
    await expect(match, 'game line gets the background').toHaveCSS('background-color', 'rgb(0, 64, 128)');
});

test('GMCP event trigger lets the user pick a known GMCP package', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);

    const modal = await openAutomation(page);
    await startNew(page, modal, 'trigger');
    await modal.getByLabel('Zdarzenie').check();

    const gmcpType = modal.getByTestId('trigger-gmcp-type');
    await expect(gmcpType, 'package picker should stay hidden until GMCP is chosen').toHaveCount(0);

    await modal.getByTitle('Zdarzenie', {exact: true}).selectOption('__gmcp__');
    await expect(gmcpType, 'should show GMCP package picker').toBeVisible();

    // Without a package it cannot be saved.
    await modal.locator('.automation-editor__foot').getByRole('button', {name: 'Zapisz', exact: true}).click();
    await expect(modal.locator('.automation-error'), 'should not save without a GMCP package').toHaveText('Wybierz zdarzenie.');

    await gmcpType.selectOption('gmcp.core.ping');
    await expect(
        modal.getByRole('button', {name: 'Dodaj warunek'}),
        'conditions should be hidden for an event without args',
    ).toHaveCount(0);

    await gmcpType.selectOption('gmcp.char.state');

    await modal.getByRole('button', {name: 'Dodaj warunek'}).click();
    const condition = modal.locator('.trigger-condition');
    await expect(condition.locator('select').first(), 'should default to the first event arg').toHaveValue('hp');
    await condition.locator('select').nth(1).selectOption('lte');
    await condition.getByPlaceholder('Wartosc').fill('2');

    await modal.getByRole('button', {name: 'Dodaj akcję'}).click();
    const action = modal.locator('.automation-act').last();
    await action.locator('select').first().selectOption('command');
    await action.getByPlaceholder('Command').fill('say hp {hp}');
    await saveEditor(modal);

    const trigger = row(modal, 'Char.State');
    await expect(trigger, 'should list the GMCP event trigger by its label').toBeVisible();
    await expect(trigger, 'should summarise the condition').toContainText('gdy hp <= 2');
    await closeAutomation(modal);

    await resetCommandLog(page);
    await pushGmcp(page, 'char.state', {hp: 4});
    await pushGmcp(page, 'char.state', {mana: 1});
    await pushGmcp(page, 'char.state', {hp: 2});

    await expect
        .poll(async () => await getLastOutgoingCommand(page), {message: 'should run macro once the condition holds'})
        .toBe('say hp 2');
    expect(
        (await getCommandLog(page)).some(c => c.includes('say hp 4')),
        'should not run macro while the condition fails',
    ).toBe(false);
});

test('exports a group and imports it back as a pack', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);

    const modal = await openAutomation(page);
    await addGroup(modal, 'Paczka');
    await startNewInGroup(page, modal, 'Paczka', 'trigger');
    await modal.getByTitle('Wzorzec', {exact: true}).fill('Pakiet test');
    await modal.getByRole('button', {name: 'Dodaj akcję'}).click();
    await modal.locator('.automation-act').last().getByPlaceholder('Command').fill('say pakiet');
    await saveEditor(modal);

    const downloadPromise = page.waitForEvent('download');
    await modal.locator('.automation-group', {hasText: 'Paczka'}).getByTitle('Opcje grupy').click();
    await page.getByRole('button', {name: 'Eksportuj grupe'}).click();
    const download = await downloadPromise;
    const file = await download.path();
    expect(download.suggestedFilename(), 'should name the file after the group').toContain('paczka');

    // Delete the trigger, then bring it back from the file.
    await row(modal, 'Pakiet test').locator('.automation-item__main').click();
    page.once('dialog', dialog => dialog.accept());
    await modal.locator('.automation-editor__foot').getByRole('button', {name: 'Usun'}).click();
    await expect(row(modal, 'Pakiet test'), 'should delete the trigger').toHaveCount(0);

    await modal.getByRole('button', {name: 'Importuj'}).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: 'Plik automatyzacji (.json)'}).click();
    await (await chooser).setFiles(file!);

    await expect(modal.locator('.automation-notice'), 'should report what came in').toContainText('1 wyzwalacz');
    const group = modal.locator('.automation-section').filter({has: page.locator('.automation-group', {hasText: 'Paczka'})});
    await expect(group.locator('.automation-item'), 'should restore the trigger into its group').toContainText('Pakiet test');
});

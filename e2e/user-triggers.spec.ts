import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    primeCharInfo,
    pushText,
    waitForCommandInput,
} from './support/mocks';

test.beforeEach(async ({context}) => {
    await primeCharInfo(context);
});

test('User trigger creation executes command and persists after reload', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);

    await page.click('#menu-button');
    await page.click('#triggers-button');

    const triggersModal = page.locator('#triggers-modal');
    await expect(triggersModal, 'should display triggers modal').toBeVisible();

    await triggersModal.getByRole('button', {name: 'Dodaj trigger'}).click();

    await triggersModal.getByPlaceholder('Pattern').fill('Trigger test');

    await triggersModal.getByRole('button', {name: 'Dodaj akcję'}).click();

    await triggersModal.locator('select').first().selectOption('command');
    await triggersModal.getByPlaceholder('Command').fill('say triggered');

    await triggersModal.getByRole('button', {name: 'Dodaj', exact: true}).click();

    await expect(
        triggersModal.locator('code.alias-pattern', {hasText: 'Trigger test'}),
        'should list newly created trigger pattern',
    ).toBeVisible();
    await expect(
        triggersModal.locator('code.alias-command', {hasText: 'command say triggered'}),
        'should display command macro summary',
    ).toBeVisible();

    await triggersModal.locator('button.btn-close').click();
    await expect(triggersModal, 'should close triggers modal').not.toBeVisible();

    await page.evaluate(() => {
        const globalScope: any = window;
        globalScope.__resetCommandLog?.();
    });

    await pushText(page, 'Trigger test incoming!');

    await expect
        .poll(async () => {
            return await getLastOutgoingCommand(page);
        }, {message: 'should send command macro when trigger matches'})
        .toBe('say triggered');

    await page.reload();
    await waitForCommandInput(page);
    await ensureGameSocket(page);

    await page.evaluate(() => {
        const globalScope: any = window;
        globalScope.__resetCommandLog?.();
    });

    await page.click('#menu-button');
    await page.click('#triggers-button');

    await expect(triggersModal, 'should reopen triggers modal').toBeVisible();
    await expect(
        triggersModal.locator('code.alias-pattern', {hasText: 'Trigger test'}),
        'should preserve trigger pattern after reload',
    ).toBeVisible();
    await expect(
        triggersModal.locator('code.alias-command', {hasText: 'command say triggered'}),
        'should preserve macro summary after reload',
    ).toBeVisible();

    await triggersModal.locator('button.btn-close').click();
    await expect(triggersModal, 'should close triggers modal after verification').not.toBeVisible();

    await pushText(page, 'Trigger test incoming again!');

    await expect
        .poll(async () => {
            return await getLastOutgoingCommand(page);
        }, {message: 'should keep executing macro after reload'})
        .toBe('say triggered');
});

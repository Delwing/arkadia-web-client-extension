import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getLastOutgoingCommand,
    primeCharInfo,
    pushGmcp,
    pushText,
    waitForCommandInput,
} from './support/mocks';

test('User trigger creation executes command and persists after reload', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);

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
        triggersModal.locator('.trigger-chip', {hasText: 'Komenda: say triggered'}),
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
        triggersModal.locator('.trigger-chip', {hasText: 'Komenda: say triggered'}),
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

test('GMCP event trigger lets the user pick a known GMCP package', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);

    await page.click('#menu-button');
    await page.click('#triggers-button');

    const triggersModal = page.locator('#triggers-modal');
    await expect(triggersModal, 'should display triggers modal').toBeVisible();

    await triggersModal.getByRole('button', {name: 'Dodaj trigger'}).click();
    await triggersModal.getByLabel('Zdarzenie').check();

    const gmcpType = triggersModal.getByTestId('trigger-gmcp-type');
    await expect(gmcpType, 'package picker should stay hidden until GMCP is chosen').toHaveCount(0);

    await triggersModal.locator('select').first().selectOption('__gmcp__');
    await expect(gmcpType, 'should show GMCP package picker').toBeVisible();
    await expect(
        triggersModal.getByRole('button', {name: 'Dodaj', exact: true}),
        'should not save without a GMCP package',
    ).toBeDisabled();

    await gmcpType.selectOption('gmcp.core.ping');
    await expect(
        triggersModal.getByRole('button', {name: 'Dodaj warunek'}),
        'conditions should be hidden for an event without args',
    ).toHaveCount(0);

    await gmcpType.selectOption('gmcp.char.state');

    await triggersModal.getByRole('button', {name: 'Dodaj warunek'}).click();
    const condition = triggersModal.locator('.trigger-condition');
    await expect(condition.locator('select').first(), 'should default to the first event arg').toHaveValue('hp');
    await condition.locator('select').nth(1).selectOption('lte');
    await condition.getByPlaceholder('Wartosc').fill('2');

    await triggersModal.getByRole('button', {name: 'Dodaj akcję'}).click();
    // Selects in order: event, GMCP package, condition field, condition operator, macro type.
    await triggersModal.locator('select').nth(4).selectOption('command');
    await triggersModal.getByPlaceholder('Command').fill('say hp {hp}');

    await triggersModal.getByRole('button', {name: 'Dodaj', exact: true}).click();

    await expect(
        triggersModal.locator('.trigger-event-name', {hasText: 'Char.State'}),
        'should list the GMCP event trigger by its label',
    ).toBeVisible();
    await expect(triggersModal.locator('.trigger-conditions'), 'should summarise the condition').toHaveText('gdy hp <= 2');

    await triggersModal.locator('button.btn-close').click();
    await expect(triggersModal).not.toBeVisible();

    await page.evaluate(() => {
        (window as any).__resetCommandLog?.();
    });

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

import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, submitCommand, waitForCharacter, waitForCommandInput} from './support/mocks';
import {goToSettingsPage, SETTINGS_MODAL} from './support/settings';

test('a floating window stays open while a modal over it is used and closed', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'Modaltester', object_num: 70301});
    await waitForCharacter(page, 'Modaltester');

    await submitCommand(page, '/zabici2w');
    const win = page.locator('.zabici2-popup');
    await expect(win, 'should open the window').toBeVisible();

    // Clicks inside the dialog, then its close button. Opened from the
    // window's own button: the main menu would be an outside click.
    await win.getByRole('button', {name: 'Import', exact: true}).click();
    await expect(page.locator(SETTINGS_MODAL)).toBeVisible();
    await goToSettingsPage(page, 'data-import');
    await page.locator(`${SETTINGS_MODAL} .app-modal__close`).first().click();
    await expect(page.locator(SETTINGS_MODAL), 'should close the settings dialog').not.toBeVisible();
    await expect(win, 'clicks in the dialog are not outside clicks for the window').toBeVisible();

    // Escape closes the dialog, not the window under it.
    await win.getByRole('button', {name: 'Import', exact: true}).click();
    await expect(page.locator(SETTINGS_MODAL)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(SETTINGS_MODAL), 'Escape should close the settings dialog').not.toBeVisible();
    await expect(win, 'Escape in the dialog should leave the window open').toBeVisible();

    // A real outside click still closes it.
    await page.locator('#message-input').click();
    await expect(win, 'an outside click should still close the window').toHaveCount(0);
});

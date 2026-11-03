import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCharacter, waitForCommandInput} from './support/mocks';

// Pamięć przeglądarki: the main menu's storage row opens a breakdown of what
// the client keeps, and from the logs' row, Logi straight on Zarządzaj.

test('the storage row opens the breakdown, and the logs lead to Zarządzaj', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'Tester', object_num: 12345});
    await waitForCharacter(page, 'Tester');
    await pushText(page, 'Krasnolud pilnuje magazynu.');

    await page.click('#menu-button');
    await page.locator('.command-menu__storage').click();

    const modal = page.locator('#storage-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('.command-menu__panel')).toHaveCount(0);
    await expect(modal.locator('.storage-report__total-figure')).toHaveText(/ z /);

    const logs = modal.locator('tr[data-part="ArkadiaLogsDB"]');
    await expect(logs).toContainText('Logi');
    await expect(logs).toContainText(/~[\d,]+ (kB|MB)/);
    await expect(modal.locator('tr[data-part="localStorage"]')).toContainText('Ustawienia i stan');
    await expect(modal.locator('.storage-report__head')).toContainText('Co zajmuje miejsce');

    await logs.getByRole('button', {name: 'Zarządzaj'}).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#logs-modal')).toBeVisible();
    await expect(page.getByText('Zarządzanie logami')).toBeVisible();
});

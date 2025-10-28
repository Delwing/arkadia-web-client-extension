import {expect, test} from '@playwright/test';
import {installMockWebSocket, waitForClientReady} from './support/mocks';

test.beforeEach(async ({context}) => {
    await installMockWebSocket(context);
});

test('Package manager documentation page can be opened from the list', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);

    await page.click('#menu-button');
    await page.click('#docs-button');

    const docsModal = page.locator('#docs-modal');
    await expect(docsModal).toBeVisible();

    const docsMenu = docsModal.locator('#docs-menu');
    await docsMenu.click();

    await docsModal.getByRole('menuitem', {name: 'Menedżer pojemników'}).click();

    await expect(docsMenu).toHaveText('Menedżer pojemników');
    await expect(docsModal.locator('#docs-content')).toContainText('Menedżer pojemników pozwala');
});

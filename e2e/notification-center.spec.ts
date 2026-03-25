import {expect, test} from './support/fixtures';
import {ensureGameSocket, submitCommand, waitForCommandInput} from './support/mocks';

test.describe('Notification center', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('starts empty', async ({page}) => {
        const count = await page.evaluate(() => {
            const el = document.getElementById('notification-center');
            return el ? el.querySelectorAll('.notification').length : -1;
        });
        expect(count).toBe(0);
    });

    test('renders notification with correct text', async ({page}) => {
        await submitCommand(page, '/opoz 2');

        const notification = page.locator('#notification-center .notification');
        await expect(notification).toBeVisible();
        await expect(notification).toHaveText('[WALK] delay 2.00s');
    });

    test('auto-removes after default timeout', async ({page}) => {
        await submitCommand(page, '/opoz 1');

        const notification = page.locator('#notification-center .notification');
        await expect(notification).toBeVisible();

        // Default timeout is 2000ms
        await expect(notification).toBeHidden({timeout: 4000});
    });

    test('multiple notifications stack', async ({page}) => {
        await submitCommand(page, '/opoz 1');
        await submitCommand(page, '/szybciej');
        await submitCommand(page, '/wolniej');

        const notifications = page.locator('#notification-center .notification');
        await expect(notifications).toHaveCount(3);
        await expect(notifications.nth(0)).toHaveText('[WALK] delay 1.00s');
        await expect(notifications.nth(1)).toHaveText('[WALK] delay 0.50s');
        await expect(notifications.nth(2)).toHaveText('[WALK] delay 1.00s');
    });
});

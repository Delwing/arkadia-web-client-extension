import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';

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
        await page.evaluate(() => {
            (window as any).clientExtension.emit('notify', {text: 'Hello world'});
        });

        const notification = page.locator('#notification-center .notification');
        await expect(notification).toBeVisible();
        await expect(notification).toHaveText('Hello world');
    });

    test('auto-removes after default timeout', async ({page}) => {
        await page.evaluate(() => {
            (window as any).clientExtension.emit('notify', {text: 'Temporary'});
        });

        const notification = page.locator('#notification-center .notification');
        await expect(notification).toBeVisible();

        // Default timeout is 2000ms
        await expect(notification).toBeHidden({timeout: 4000});
    });

    test('auto-removes after custom timeout', async ({page}) => {
        await page.evaluate(() => {
            (window as any).clientExtension.emit('notify', {text: 'Quick', time: 500});
        });

        const notification = page.locator('#notification-center .notification');
        await expect(notification).toBeVisible();

        await expect(notification).toBeHidden({timeout: 2000});
    });

    test('multiple notifications stack', async ({page}) => {
        await page.evaluate(() => {
            const ext = (window as any).clientExtension;
            ext.emit('notify', {text: 'First', time: 10000});
            ext.emit('notify', {text: 'Second', time: 10000});
            ext.emit('notify', {text: 'Third', time: 10000});
        });

        const notifications = page.locator('#notification-center .notification');
        await expect(notifications).toHaveCount(3);
        await expect(notifications.nth(0)).toHaveText('First');
        await expect(notifications.nth(1)).toHaveText('Second');
        await expect(notifications.nth(2)).toHaveText('Third');
    });
});

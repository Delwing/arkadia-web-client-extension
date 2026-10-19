import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, submitCommand, waitForCommandInput} from './support/mocks';

test.describe('Idle logout warning', () => {
    test('counts down the last minute and goes away on a command', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, 'char.options', {max_idle_time: 2});

        const toast = page.locator('#notification-center .toast', {hasText: 'Czas do wylogowania przez nieaktywność'});
        await page.clock.runFor(55_000);
        await expect(toast).toHaveCount(0);

        await page.clock.runFor(10_000);
        await expect(toast).toBeVisible();
        await expect(toast).toHaveClass(/toast--warning/);
        await expect(toast.locator('.toast__progress')).toBeVisible();

        await submitCommand(page, 'kondycja');
        await expect(toast).toHaveCount(0);
    });

    test('an alias that sends nothing to the game does not clear it', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, 'char.options', {max_idle_time: 2});

        const toast = page.locator('#notification-center .toast', {hasText: 'Czas do wylogowania przez nieaktywność'});
        await page.clock.runFor(65_000);
        await expect(toast).toBeVisible();

        // `/opoz` only changes a client setting.
        await submitCommand(page, '/opoz 2');
        await page.clock.runFor(1_000);
        await expect(toast).toBeVisible();
    });
});

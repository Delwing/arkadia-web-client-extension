import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, waitForCommandInput, getLastOutgoingCommand} from './support/mocks';

test.describe('Mail status', () => {
    test('does not display for unread only', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const mailStatus = page.locator('#mail-status');

        // Initially, mail status should be hidden
        await expect(mailStatus, 'should be hidden initially').not.toBeVisible();

        // Send mail state with unread only
        await pushGmcp(page, 'mail.state', {
            unread: true,
        });

        // Should remain hidden (we don't care about unread)
        await expect(mailStatus, 'should be hidden for unread only').not.toBeVisible();
    });

    test('displays multiple mail statuses', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const mailStatus = page.locator('#mail-status');

        // Send mail state with multiple flags (including unread which is ignored)
        await pushGmcp(page, 'mail.state', {
            unread: true,
            unreceived: true,
            unsent: true,
        });

        await expect(mailStatus, 'should be visible with multiple flags').toBeVisible();
        await expect(mailStatus, 'should show only unreceived and unsent').toHaveText('✉: Nowa, Niewyslana');
    });

    test('hides when all flags are false', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const mailStatus = page.locator('#mail-status');

        // Send mail state with unreceived
        await pushGmcp(page, 'mail.state', {
            unreceived: true,
        });

        await expect(mailStatus, 'should be visible').toBeVisible();

        // Clear all flags
        await pushGmcp(page, 'mail.state', {
            unread: false,
            unreceived: false,
            unsent: false,
        });

        await expect(mailStatus, 'should be hidden when all flags are false').not.toBeVisible();
    });

    test('updates when mail state changes', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const mailStatus = page.locator('#mail-status');

        // Send initial state
        await pushGmcp(page, 'mail.state', {
            unsent: true,
        });

        await expect(mailStatus, 'should show initial state').toHaveText('✉: Niewyslana');

        // Change to different state
        await pushGmcp(page, 'mail.state', {
            unreceived: true,
        });

        await expect(mailStatus, 'should update to new state').toHaveText('✉: Nowa');
    });

    test('shows only unreceived status', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const mailStatus = page.locator('#mail-status');

        await pushGmcp(page, 'mail.state', {
            unreceived: true,
        });

        await expect(mailStatus, 'should display unreceived status').toHaveText('✉: Nowa');
    });

    test('shows only unsent status', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const mailStatus = page.locator('#mail-status');

        await pushGmcp(page, 'mail.state', {
            unsent: true,
        });

        await expect(mailStatus, 'should display unsent status').toHaveText('✉: Niewyslana');
    });

    test('sends command when clicked', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const mailStatus = page.locator('#mail-status');

        // Show mail status
        await pushGmcp(page, 'mail.state', {
            unreceived: true,
        });

        await expect(mailStatus, 'should be visible').toBeVisible();

        // Click the mail status
        await mailStatus.click();

        // Wait a bit for the command to be sent
        await page.waitForTimeout(100);

        // Check the command was sent
        const command = await getLastOutgoingCommand(page);
        expect(command, 'should send wyslij zwierze command').toBe('wyslij zwierze');
    });
});

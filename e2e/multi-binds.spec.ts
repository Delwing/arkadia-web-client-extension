import {expect, test} from './support/fixtures';
import {ensureGameSocket, submitCommand, waitForCommandInput} from './support/mocks';

test.describe('Multi-binds display', () => {
    test('shows multi-binds list when binds are set', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const multiBinds = page.locator('#multi-binds');

        // Initially, the container should not have active class
        await expect(multiBinds, 'should not be active initially').not.toHaveClass(/active/);

        // Create a multibind using the /mbind command
        await submitCommand(page, '/mbind 1 atak orka');

        // Wait for the bind to be processed
        await page.waitForTimeout(200);

        // Container should have active class
        await expect(multiBinds, 'should be active when binds are present').toHaveClass(/active/);

        // Verify bind is rendered
        const binds = multiBinds.locator('.multi-bind');
        await expect(binds, 'should have at least one bind').toHaveCount(1);
        await expect(binds.first(), 'should display bind text').toContainText('atak orka');
    });

    test('clears bind when using /mbind-', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const multiBinds = page.locator('#multi-binds');

        // Create a bind
        await submitCommand(page, '/mbind 1 test command');
        await page.waitForTimeout(200);

        await expect(multiBinds, 'should be active').toHaveClass(/active/);

        // Remove the bind
        await submitCommand(page, '/mbind- 1');
        await page.waitForTimeout(200);

        // Container should not be active anymore
        await expect(multiBinds, 'should not be active after removing all binds').not.toHaveClass(/active/);
    });
});

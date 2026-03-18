import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';

test.describe('Release guard timer', () => {
    test('displays initial state with guard ON and timer OK', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuardTimer = page.locator('#release-guard-timer');

        // Should be visible with initial state
        await expect(releaseGuardTimer, 'should be visible initially').toBeVisible();
        await expect(releaseGuardTimer, 'should display Pusc').toContainText('Pusc');
        await expect(releaseGuardTimer, 'should display Zas:').toContainText('Zas:');
        await expect(releaseGuardTimer, 'should show OK state').toContainText('OK');

        // Pusc should be white when active
        const puscSpan = releaseGuardTimer.locator('span').first();
        await expect(puscSpan, 'Pusc should be white when active').toHaveCSS('color', 'rgba(255, 255, 255, 0.95)');
    });

    test('toggles guard state when clicking anywhere on element', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuardTimer = page.locator('#release-guard-timer');
        const puscSpan = releaseGuardTimer.locator('span').first();

        // Initial state should be ON (strong)
        await expect(puscSpan, 'Pusc should be strong initially').toHaveCSS('color', 'rgba(255, 255, 255, 0.95)');

        // Click anywhere to turn OFF
        await releaseGuardTimer.click();

        // Should change to OFF state (dim)
        await expect(puscSpan, 'Pusc should be dim after click').toHaveCSS('color', 'rgba(255, 255, 255, 0.5)');

        // Click again to toggle back ON
        await releaseGuardTimer.click();

        // Should return to ON state (strong)
        await expect(puscSpan, 'Pusc should be strong again').toHaveCSS('color', 'rgba(255, 255, 255, 0.95)');
    });

    test('always remains visible', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuardTimer = page.locator('#release-guard-timer');

        // Should always be visible
        await expect(releaseGuardTimer, 'should be visible initially').toBeVisible();

        // Click to change state
        await releaseGuardTimer.click();

        // Should still be visible
        await expect(releaseGuardTimer, 'should remain visible after toggle').toBeVisible();
    });

    test('shows timer countdown when cover is triggered', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuardTimer = page.locator('#release-guard-timer');

        // Initially shows OK
        await expect(releaseGuardTimer, 'should display OK initially').toContainText('OK');

        // Trigger cover timer with a cover message
        await pushText(page, 'Zrecznie zaslaniasz Aldousa przed ciosami orka.');

        // Should show countdown value (5 second timer)
        await expect(releaseGuardTimer, 'should show countdown').toContainText('Zas:');

        // The countdown value should be yellow
        const valueSpan = releaseGuardTimer.locator('span').nth(2);
        await expect(valueSpan, 'countdown should be yellow').toHaveCSS('color', 'rgb(255, 255, 0)');
    });

    test('shows OK when timer completes', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuardTimer = page.locator('#release-guard-timer');

        // Trigger cover timer with a cover message
        await pushText(page, 'Zrecznie zaslaniasz Aldousa przed ciosami orka.');

        // Should show countdown
        await expect(releaseGuardTimer, 'should show countdown').toContainText('Zas:');

        // Wait for timer to expire (5 seconds + buffer)
        await page.clock.runFor(5500);

        // Should show OK again
        await expect(releaseGuardTimer, 'should show OK after timer completes').toContainText('OK');

        // OK should be green
        const okSpan = releaseGuardTimer.locator('span').nth(2);
        await expect(okSpan, 'OK should be green').toHaveCSS('color', 'rgb(0, 255, 127)');
    });
});

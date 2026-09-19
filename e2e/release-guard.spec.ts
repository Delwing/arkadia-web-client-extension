import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';
import {resolveColor} from './support/theme';

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

        // Pusc takes the footer's strong text role when active. Resolved from the
        // token rather than hard-coded: the footer themes from --ark-* now, so a
        // literal would pin this test to one theme's shade.
        const puscSpan = releaseGuardTimer.locator('span').first();
        const strong = await resolveColor(page, 'var(--footer-text-strong)');
        await expect(puscSpan, 'Pusc should take the strong footer colour when active').toHaveCSS('color', strong);
    });

    test('toggles guard state when clicking anywhere on element', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuardTimer = page.locator('#release-guard-timer');
        const puscSpan = releaseGuardTimer.locator('span').first();
        const strong = await resolveColor(page, 'var(--footer-text-strong)');
        const dim = await resolveColor(page, 'var(--footer-text-dim)');
        expect(strong, 'the two footer text roles must differ, or this test proves nothing').not.toBe(dim);

        // Initial state should be ON (strong)
        await expect(puscSpan, 'Pusc should be strong initially').toHaveCSS('color', strong);

        // Click anywhere to turn OFF
        await releaseGuardTimer.click();

        // Should change to OFF state (dim)
        await expect(puscSpan, 'Pusc should be dim after click').toHaveCSS('color', dim);

        // Click again to toggle back ON
        await releaseGuardTimer.click();

        // Should return to ON state (strong)
        await expect(puscSpan, 'Pusc should be strong again').toHaveCSS('color', strong);
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

import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';

test.describe('Release guard', () => {
    test('displays initial state as ON', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuard = page.locator('#release-guard');

        // Should be visible with initial state
        await expect(releaseGuard, 'should be visible initially').toBeVisible();
        await expect(releaseGuard, 'should display ON state initially').toHaveText('Pusc zas: on');
        await expect(releaseGuard, 'should have on class initially').toHaveClass('on');
    });

    test('toggles state when clicked', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuard = page.locator('#release-guard');

        // Initial state should be ON
        await expect(releaseGuard, 'should start in ON state').toHaveText('Pusc zas: on');
        await expect(releaseGuard, 'should have on class').toHaveClass('on');

        // Click to toggle
        await releaseGuard.click();

        // Wait for the state to update
        await page.waitForTimeout(100);

        // Should change to OFF state
        await expect(releaseGuard, 'should change to OFF state after click').toHaveText('Pusc zas: off');
        await expect(releaseGuard, 'should have off class after click').toHaveClass('off');

        // Click again to toggle back
        await releaseGuard.click();

        await page.waitForTimeout(100);

        // Should return to ON state
        await expect(releaseGuard, 'should return to ON state').toHaveText('Pusc zas: on');
        await expect(releaseGuard, 'should have on class again').toHaveClass('on');
    });

    test('always remains visible', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuard = page.locator('#release-guard');

        // Should always be visible (block display)
        await expect(releaseGuard, 'should be visible initially').toBeVisible();

        // Click to change state
        await releaseGuard.click();
        await page.waitForTimeout(100);

        // Should still be visible
        await expect(releaseGuard, 'should remain visible after toggle').toBeVisible();
    });
});

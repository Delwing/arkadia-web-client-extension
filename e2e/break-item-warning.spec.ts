import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';

test.describe('Break item warning', () => {
    test('displays and hides warning when item breaks', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const warning = page.locator('#break-item-warning');

        // Initially, the warning should be hidden
        await expect(warning, 'should be hidden initially').not.toBeVisible();

        // Trigger break item warning with exact game text pattern
        await pushText(page, 'Twoj lekki miecz peka!');

        // Warning should be visible
        await expect(warning, 'should be visible when item breaks').toBeVisible();

        // Click to dismiss
        await warning.click();

        // Should be hidden after clicking
        await expect(warning, 'should be hidden after clicking').not.toBeVisible();
    });

    test('shows warning for armor break', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const warning = page.locator('#break-item-warning');

        // Trigger armor break with different pattern
        await pushText(page, 'Twoja lekka zbroja rozpada sie!');

        await expect(warning, 'should be visible for armor break').toBeVisible();
    });
});

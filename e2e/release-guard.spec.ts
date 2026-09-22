import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';

// The "Zaslona" footer chip (#release-guard-timer) carries both the cover cooldown and
// the guard-release toggle (/puszczaj): an outline shield while covers are released
// automatically (the default), a filled one while the guard is held.
test.describe('Release guard timer', () => {
    test('displays initial state with guard released and timer OK', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const chip = page.locator('#release-guard-timer .chip');

        await expect(chip, 'should be visible initially').toBeVisible();
        await expect(chip.locator('.chip__val'), 'should show OK state').toHaveText('OK');
        await expect(chip.locator('.chip__ico--fill'), 'shield outline: covers released').toHaveCount(0);
    });

    test('toggles guard state on click', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const chip = page.locator('#release-guard-timer .chip');
        const filled = chip.locator('.chip__ico--fill');

        await expect(filled, 'released initially').toHaveCount(0);
        await chip.click();
        await expect(filled, 'held after a click').toHaveCount(1);
        await chip.click();
        await expect(filled, 'released again').toHaveCount(0);
        await expect(chip, 'should remain visible after toggling').toBeVisible();
    });

    test('shows the countdown when cover is triggered, OK when it completes', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const chip = page.locator('#release-guard-timer .chip');
        const value = chip.locator('.chip__val');

        await expect(value, 'should display OK initially').toHaveText('OK');

        await pushText(page, 'Zrecznie zaslaniasz Aldousa przed ciosami orka.');
        await expect(value, 'should show countdown').toHaveText(/^[0-9]\.[0-9]$/);
        await expect(chip, 'countdown in the warn tone').toHaveClass(/chip--warn/);

        await page.clock.runFor(5500);
        await expect(value, 'should show OK after timer completes').toHaveText('OK');
        await expect(chip, 'OK in the ready tone').toHaveClass(/chip--ok/);
    });
});

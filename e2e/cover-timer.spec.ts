import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';

test.describe('Cover timer', () => {
    // Cover timer is now integrated into the release-guard-timer element
    // Format: "Pusc Zas: OK" or "Pusc Zas: X.XX"
    // The timer value is in the 3rd span (index 2)

    test('starts countdown after successful cover', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuardTimer = page.locator('#release-guard-timer');

        // Initially, the timer should show OK (ready state)
        await expect(releaseGuardTimer, 'should display ready state initially').toContainText('Zas:');
        await expect(releaseGuardTimer, 'should display OK initially').toContainText('OK');

        // Check that the value "OK" is green (springgreen) - it's the 3rd span (index 2)
        const okSpan = releaseGuardTimer.locator('span').nth(2);
        await expect(okSpan, 'should have green color initially').toHaveCSS('color', 'rgb(0, 255, 127)'); // springgreen

        // Trigger cover timer with a successful cover message
        await pushText(page, 'Zrecznie zaslaniasz Aldousa przed ciosami orka.');

        // Timer should start counting down
        await expect(releaseGuardTimer, 'should display countdown after cover').toContainText('Zas:');

        // Check that the countdown value is yellow - it's the 3rd span (index 2)
        const valueSpan = releaseGuardTimer.locator('span').nth(2);
        await expect(valueSpan, 'should have yellow color during countdown').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow

        // Verify countdown is showing a number
        const timerText = await releaseGuardTimer.textContent();
        expect(timerText, 'should show countdown value').toMatch(/Zas: [0-9]\.[0-9]{2}/);
    });

    test('starts countdown after failed cover attempt', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuardTimer = page.locator('#release-guard-timer');

        // Trigger cover timer with a failed cover message
        await pushText(page, 'Probujesz zaslonic Berenika przed ciosami goblina, jednak nie jestes w stanie tego uczynic.');

        // Timer should start counting down even on failure
        await expect(releaseGuardTimer, 'should display countdown after failed cover').toContainText('Zas:');

        // Check that the countdown value is yellow - it's the 3rd span (index 2)
        const valueSpan = releaseGuardTimer.locator('span').nth(2);
        await expect(valueSpan, 'should have yellow color during countdown').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow
    });

    test('returns to ready state after timer expires', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuardTimer = page.locator('#release-guard-timer');

        // Trigger cover timer
        await pushText(page, 'Z wprawa stajesz pomiedzy Cedrikiem a trolem, przyjmujac na siebie nadchodzace ciosy.');

        // Wait for countdown
        await expect(releaseGuardTimer, 'should display countdown').toContainText('Zas:');

        // Check that the countdown value is yellow - it's the 3rd span (index 2)
        const valueSpanCountdown = releaseGuardTimer.locator('span').nth(2);
        await expect(valueSpanCountdown, 'should have yellow color during countdown').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow

        // Wait for timer to expire (5 seconds + buffer)
        await page.clock.runFor(5500);

        // Timer should return to ready state
        await expect(releaseGuardTimer, 'should return to ready state after timer expires').toContainText('OK');

        // Check that the value "OK" is green after timer expires - it's the 3rd span (index 2)
        const okSpan = releaseGuardTimer.locator('span').nth(2);
        await expect(okSpan, 'should have green color after timer expires').toHaveCSS('color', 'rgb(0, 255, 127)'); // springgreen
    });

    test('starts countdown for guard position with weapon', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const releaseGuardTimer = page.locator('#release-guard-timer');

        // Trigger cover timer with weapon-based cover message
        await pushText(page, 'Unosisz swoja szable i szybko przesuwasz sie za Dagne, kryjac sie przed atakami');

        // Timer should start counting down
        await expect(releaseGuardTimer, 'should display countdown for weapon cover').toContainText('Zas:');

        // Check that the countdown value is yellow - it's the 3rd span (index 2)
        const valueSpan = releaseGuardTimer.locator('span').nth(2);
        await expect(valueSpan, 'should have yellow color during countdown').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow
    });
});

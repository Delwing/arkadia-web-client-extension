import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';

test.describe('Lamp timer', () => {
    test('shows timer when lamp is lit', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const lampTimer = page.locator('#lamp-timer');

        // Initially, the timer should be hidden
        await expect(lampTimer, 'should be hidden initially').not.toBeVisible();

        // Light the lamp
        await pushText(page, 'Zapalasz swoja lampe.');

        // Timer should start at 300 seconds (5:00) with green color
        await expect(lampTimer, 'should be visible after lighting lamp').toBeVisible();
        await expect(lampTimer, 'should display countdown').toContainText('lamp ');

        // Check that the timer value is green (springgreen)
        const valueSpan = lampTimer.locator('span').nth(1);
        await expect(valueSpan, 'should have green color at 300 seconds').toHaveCSS('color', 'rgb(0, 255, 127)'); // springgreen

        // Verify time format (M:SS)
        const timerText = await lampTimer.textContent();
        expect(timerText, 'should show time in M:SS format').toMatch(/lamp [0-9]:[0-9]{2}/);
    });

    test('changes to yellow when below 60 seconds', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const lampTimer = page.locator('#lamp-timer');

        // Light the lamp (starts at 300 seconds)
        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(lampTimer, 'should be visible').toBeVisible();

        // Advance time to 59 seconds remaining (300 - 59 = 241 seconds elapsed)
        await page.clock.runFor(241000);

        // Timer should show yellow
        await expect(lampTimer, 'should display countdown below 60s').toContainText('lamp ');
        const valueSpan = lampTimer.locator('span').nth(1);
        await expect(valueSpan, 'should have yellow color below 60 seconds').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow
    });

    test('changes to red when below 30 seconds', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const lampTimer = page.locator('#lamp-timer');

        // Light the lamp (starts at 300 seconds)
        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(lampTimer, 'should be visible').toBeVisible();

        // Advance time to 29 seconds remaining (300 - 29 = 271 seconds elapsed)
        await page.clock.runFor(271000);

        // Timer should show red
        await expect(lampTimer, 'should display countdown below 30s').toContainText('lamp ');
        const valueSpan = lampTimer.locator('span').nth(1);
        await expect(valueSpan, 'should have red color below 30 seconds').toHaveCSS('color', 'rgb(255, 99, 71)'); // tomato
    });

    test('hides when lamp is extinguished', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const lampTimer = page.locator('#lamp-timer');

        // Light the lamp
        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(lampTimer, 'should be visible after lighting').toBeVisible();

        // Extinguish the lamp
        await pushText(page, 'Gasisz swoja lampe.');

        // Timer should be hidden
        await expect(lampTimer, 'should be hidden after extinguishing').not.toBeVisible();
    });

    test('resets when lamp is refilled', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const lampTimer = page.locator('#lamp-timer');

        // Light the lamp (starts at 300 seconds)
        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(lampTimer, 'should be visible').toBeVisible();

        // Advance time to 50 seconds remaining (300 - 50 = 250 seconds elapsed)
        await page.clock.runFor(250000);

        // Get timer value before refill
        const timerTextBefore = await lampTimer.textContent();
        const matchBefore = timerTextBefore?.match(/lamp ([0-9]):([0-9]{2})/);
        let secondsBefore = 0;
        if (matchBefore) {
            secondsBefore = parseInt(matchBefore[1]) * 60 + parseInt(matchBefore[2]);
        }

        // Refill the lamp (resets internal counter to 300 seconds)
        await pushText(page, 'Dopelniasz swoja lampe oleju.');

        // Wait for the next timer tick
        await page.clock.runFor(1000);

        // Timer should have more time than before (it resets to 300s internally)
        const timerTextAfter = await lampTimer.textContent();
        const matchAfter = timerTextAfter?.match(/lamp ([0-9]):([0-9]{2})/);
        if (matchAfter) {
            const secondsAfter = parseInt(matchAfter[1]) * 60 + parseInt(matchAfter[2]);
            expect(secondsAfter, 'should have more time after refill').toBeGreaterThan(secondsBefore);
        }
    });

    test('stops when lamp runs out of oil', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const lampTimer = page.locator('#lamp-timer');

        // Light the lamp
        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(lampTimer, 'should be visible').toBeVisible();

        // Lamp runs out and goes out
        await pushText(page, 'lampa wypala sie i gasnie.');

        // Timer should be hidden
        await expect(lampTimer, 'should be hidden when lamp runs out').not.toBeVisible();
    });

    test('shows correct format with white label and colored value', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const lampTimer = page.locator('#lamp-timer');

        // Light the lamp
        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(lampTimer, 'should be visible').toBeVisible();

        // Check label is white
        const labelSpan = lampTimer.locator('span').nth(0);
        await expect(labelSpan, 'label should be white').toHaveCSS('color', 'rgb(255, 255, 255)'); // white
        await expect(labelSpan, 'label text should be "lamp "').toHaveText('lamp ');

        // Check value is colored
        const valueSpan = lampTimer.locator('span').nth(1);
        await expect(valueSpan, 'value should have color').toHaveCSS('color', 'rgb(0, 255, 127)'); // springgreen

        // Verify value has time format
        const valueText = await valueSpan.textContent();
        expect(valueText, 'value should be time format').toMatch(/[0-9]:[0-9]{2}/);
    });
});

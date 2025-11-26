import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';

test.describe('Combat timer', () => {
    test('timer counts down after combat ends', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const combatTimer = page.locator('#combat-timer');

        // Set player and enter combat
        await pushGmcp(page, 'char.info', {
            object_num: 12345,
        });

        await pushGmcp(page, 'objects.data', {
            12345: { attack_num: 67890 },
        });

        await page.clock.runFor(100);

        // Exit combat to start the countdown
        await pushGmcp(page, 'objects.data', {
            12345: { attack_num: false },
        });

        await page.clock.runFor(100);

        // Timer should be visible showing countdown after combat
        await expect(combatTimer, 'should be visible after combat ends').toBeVisible();
        await expect(combatTimer, 'should show countdown').toContainText('Walka: ');

        // Get initial time
        const initialText = await combatTimer.textContent();
        const initialMatch = initialText?.match(/Walka: (\d+)/);
        expect(initialMatch, 'should have countdown value').toBeTruthy();

        const initialSeconds = initialMatch ? parseInt(initialMatch[1]) : 0;

        // Wait for countdown
        await page.clock.runFor(2000);

        // Get updated time
        const updatedText = await combatTimer.textContent();
        const updatedMatch = updatedText?.match(/Walka: (\d+)/);

        if (updatedMatch) {
            const updatedSeconds = parseInt(updatedMatch[1]);
            expect(updatedSeconds, 'should be counting down').toBeLessThan(initialSeconds);
        }
    });

    test('hides when entering combat', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const combatTimer = page.locator('#combat-timer');

        // Set player
        await pushGmcp(page, 'char.info', {
            object_num: 12345,
        });

        // Enter and exit combat to start countdown
        await pushGmcp(page, 'objects.data', {
            12345: { attack_num: 67890 },
        });

        await page.clock.runFor(100);

        await pushGmcp(page, 'objects.data', {
            12345: { attack_num: false },
        });

        await page.clock.runFor(100);

        // Timer should be visible
        await expect(combatTimer, 'should be visible after combat').toBeVisible();

        // Enter combat again
        await pushGmcp(page, 'objects.data', {
            12345: { attack_num: 99999 },
        });

        await page.clock.runFor(100);

        // Timer should hide when in active combat
        await expect(combatTimer, 'should hide when entering combat').not.toBeVisible();
    });

    test('stops timer when re-entering combat while timer is running', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const combatTimer = page.locator('#combat-timer');

        // Set player and enter combat
        await pushGmcp(page, 'char.info', {
            object_num: 12345,
        });

        await pushGmcp(page, 'objects.data', {
            12345: { attack_num: 67890 },
        });

        await page.clock.runFor(100);

        // Exit combat - timer starts immediately
        await pushGmcp(page, 'objects.data', {
            12345: { attack_num: false },
        });

        await page.clock.runFor(100);

        // Timer should be visible
        await expect(combatTimer, 'should be visible after leaving combat').toBeVisible();

        // Get the countdown value
        const timerText = await combatTimer.textContent();
        const match = timerText?.match(/Walka: (\d+)/);
        expect(match, 'should have countdown value').toBeTruthy();
        const countdownValue = match ? parseInt(match[1]) : 0;
        expect(countdownValue, 'should have started countdown').toBeGreaterThan(0);

        // Re-enter combat while timer is still running
        await pushGmcp(page, 'objects.data', {
            12345: { attack_num: 11111 },
        });

        await page.clock.runFor(100);

        // Timer should immediately hide
        await expect(combatTimer, 'should hide when re-entering combat').not.toBeVisible();

        // Wait some time and verify timer doesn't come back
        await page.clock.runFor(2000);
        await expect(combatTimer, 'should stay hidden during combat').not.toBeVisible();
    });
});

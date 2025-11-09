import {expect, test} from './support/fixtures';
import {ensureGameSocket, GMCP_PATHS, pushGmcp, pushText, waitForCommandInput} from './support/mocks';

test.describe('Order timer', () => {
    test('is hidden when not team leader', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const orderTimer = page.locator('#order-timer');

        // Initially, the timer should be hidden (not team leader)
        await expect(orderTimer, 'should be hidden when not team leader').toHaveCSS('display', 'none');
    });

    test('shows OK when team leader with no active timer', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up player as team leader
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 100 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: true },
        });

        const orderTimer = page.locator('#order-timer');

        // Timer should show OK (ready state) when team leader
        await expect(orderTimer, 'should display ready state when team leader').toHaveText('Rozkaz: OK');

        // Check that the value "OK" is green (springgreen)
        const okSpan = orderTimer.locator('span').nth(1);
        await expect(okSpan, 'should have green color initially').toHaveCSS('color', 'rgb(0, 255, 127)'); // springgreen

        // Timer should be visible
        await expect(orderTimer, 'should be visible when team leader').toHaveCSS('display', 'block');
    });

    test('starts countdown after "Wydajesz rozkaz" message', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up player as team leader
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 100 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: true },
        });

        const orderTimer = page.locator('#order-timer');

        // Trigger order timer with first pattern
        await pushText(page, 'Wydajesz rozkaz.');

        // Timer should start counting down
        await expect(orderTimer, 'should display countdown after order').toContainText('Rozkaz: ');

        // Check that the countdown value is yellow
        const valueSpan = orderTimer.locator('span').nth(1);
        await expect(valueSpan, 'should have yellow color during countdown').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow

        // Verify countdown is showing a number
        const timerText = await orderTimer.textContent();
        expect(timerText, 'should show countdown value').toMatch(/Rozkaz: [0-9]+\.[0-9]{2}/);
    });

    test('starts countdown after failed order message', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up player as team leader
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 100 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: true },
        });

        const orderTimer = page.locator('#order-timer');

        // Wait for timer to show ready state first
        await expect(orderTimer, 'should show ready state initially').toHaveText('Rozkaz: OK');

        // Trigger order timer with second pattern (failed order)
        await pushText(page, 'Glosno wypowiadasz rozkaz, chyba jednak nikt cie nie zrozumial.');

        // Timer should start counting down even on failure
        await expect(orderTimer, 'should display countdown after failed order').not.toHaveText('Rozkaz: OK');

        // Check that the countdown value is yellow
        const valueSpan = orderTimer.locator('span').nth(1);
        await expect(valueSpan, 'should have yellow color during countdown').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow
    });

    test('starts countdown when receiving team leadership', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up player as team member (not leader yet)
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 100 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: false },
            '101': { desc: 'Leader', team: true, team_leader: true },
        });

        const orderTimer = page.locator('#order-timer');

        // Timer should be hidden (not leader)
        await expect(orderTimer, 'should be hidden when not leader').toHaveCSS('display', 'none');

        // Update GMCP to reflect new leadership BEFORE the text trigger
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: true },
            '101': { desc: 'Leader', team: true, team_leader: false },
        });

        // Timer should now be visible
        await expect(orderTimer, 'should be visible after becoming leader').toHaveCSS('display', 'block');
        await expect(orderTimer, 'should show ready state').toHaveText('Rozkaz: OK');

        // Trigger leadership transfer with third pattern
        await pushText(page, 'Leader przekazuje ci prowadzenie druzyny.');

        // Timer should start counting down
        await expect(orderTimer, 'should display countdown after receiving leadership').not.toHaveText('Rozkaz: OK');

        // Check that the countdown value is yellow
        const valueSpan = orderTimer.locator('span').nth(1);
        await expect(valueSpan, 'should have yellow color during countdown').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow
    });

    test('returns to ready state after timer expires', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up player as team leader
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 100 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: true },
        });

        const orderTimer = page.locator('#order-timer');

        // Trigger order timer
        await pushText(page, 'Wydajesz rozkaz');

        // Wait for countdown
        await expect(orderTimer, 'should display countdown').toContainText('Rozkaz: ');

        // Check that the countdown value is yellow
        const valueSpanCountdown = orderTimer.locator('span').nth(1);
        await expect(valueSpanCountdown, 'should have yellow color during countdown').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow

        // Wait for timer to expire (15 seconds + buffer)
        await page.waitForTimeout(15500);

        // Timer should return to ready state
        await expect(orderTimer, 'should return to ready state after timer expires').toHaveText('Rozkaz: OK');

        // Check that the value "OK" is green after timer expires
        const okSpan = orderTimer.locator('span').nth(1);
        await expect(okSpan, 'should have green color after timer expires').toHaveCSS('color', 'rgb(0, 255, 127)'); // springgreen
    });

    test('hides timer when losing team leadership', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up player as team leader
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 100 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: true },
        });

        const orderTimer = page.locator('#order-timer');

        // Timer should be visible
        await expect(orderTimer, 'should be visible when team leader').toHaveCSS('display', 'block');
        await expect(orderTimer, 'should display ready state').toHaveText('Rozkaz: OK');

        // Lose leadership
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: false },
            '101': { desc: 'NewLeader', team: true, team_leader: true },
        });

        // Timer should now be hidden
        await expect(orderTimer, 'should be hidden after losing leadership').toHaveCSS('display', 'none');
    });

    test('does not start timer when not team leader', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set up player as team member (not leader)
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 100 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: false },
            '101': { desc: 'Leader', team: true, team_leader: true },
        });

        const orderTimer = page.locator('#order-timer');

        // Timer should be hidden
        await expect(orderTimer, 'should be hidden when not leader').toHaveCSS('display', 'none');

        // Try to trigger order timer (should not work)
        await pushText(page, 'Wydajesz rozkaz.');

        // Timer should still be hidden
        await expect(orderTimer, 'should remain hidden after order attempt').toHaveCSS('display', 'none');
    });
});

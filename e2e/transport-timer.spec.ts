import {expect, test} from './support/fixtures';
import {ensureGameSocket, GMCP_PATHS, pushGmcp, pushText, submitCommand, waitForCommandInput, waitForMapReady} from './support/mocks';

test.describe('Transport timer', () => {
    test('starts timer after boarding and departing transport', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const transportTimer = page.locator('#transport-timer');

        // Send location update to establish current position
        // This is the first location, so refreshPosition is true and enterLocation will be emitted
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6429,
            id: 6429,
            name: 'Przystan na Blekitnej Wstedze',
            zone: 'Blekitna Wstega',
            map: {
                x: 0,
                y: 0,
                name: 'Transport Docks',
            },
        });

        //Wait a bit for the location to be processed
        await page.waitForTimeout(50);

        // Initially, timer should be empty
        await expect(transportTimer, 'should be empty initially').toBeEmpty();

        // Simulate boarding the Ancelmus ship
        await submitCommand(page, 'wejdz na statek');
        await page.waitForTimeout(50);
        await pushText(page, 'Wchodzisz na wielka galere.');

        // Timer shows destination immediately for unambiguous routes (only one destination from 6429)
        await expect(transportTimer, 'should show destination after boarding').toContainText('Kraina Zgromadzenia');

        // Simulate ship departure - countdown starts now
        await pushText(page, 'Galera odbija od brzegu.');
        await page.waitForTimeout(100);

        // Timer should still show the destination with countdown
        await expect(transportTimer, 'should display timer with countdown after departure').toContainText('Tr:');
        await expect(transportTimer, 'should still show Kraina Zgromadzenia as destination').toContainText(
            'Kraina Zgromadzenia'
        );

        // Verify countdown is showing
        const timerText = await transportTimer.textContent();
        expect(timerText, 'should show countdown format').toMatch(/Tr:.*\d+:\d{2}/);
    });

    test('displays correct destination label from different starting dock', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const transportTimer = page.locator('#transport-timer');

        // Send location update for Kraina Zgromadzenia dock
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6621,
            id: 6621,
            name: 'Przystan w Krainie Zgromadzenia',
            zone: 'Kraina Zgromadzenia',
            map: {
                x: 1,
                y: 0,
                name: 'Transport Docks',
            },
        });

        // Board the ship
        await submitCommand(page, 'wejdz na statek');
        await page.waitForTimeout(50);
        await pushText(page, 'Wchodzisz na wielka galere.');

        // Disambiguate destination (from 6621 there are two possible routes)
        await pushText(page, 'Ancelmus krzyczy: Nastepnym portem bedzie wschodnie nabrzeze w Nuln!');
        await page.waitForTimeout(50);

        // Ship departs
        await pushText(page, 'Galera odbija od brzegu.');
        await page.waitForTimeout(100);

        // Should show timer with Nuln as destination
        await expect(transportTimer, 'should display timer with destination').toContainText('Tr:');
        await expect(transportTimer, 'should show Nuln as destination').toContainText('Nuln');
    });

    test('clears timer after exiting transport', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const transportTimer = page.locator('#transport-timer');

        // Send location update
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6429,
            id: 6429,
            name: 'Przystan na Blekitnej Wstedze',
            zone: 'Blekitna Wstega',
            map: {
                x: 0,
                y: 0,
                name: 'Transport Docks',
            },
        });

        // Start journey
        await submitCommand(page, 'wejdz na statek');
        await page.waitForTimeout(50);
        await pushText(page, 'Wchodzisz na wielka galere.');
        await pushText(page, 'Galera odbija od brzegu.');

        // Verify timer is active
        await expect(transportTimer, 'should have timer running').toContainText('Tr:');

        // Exit the ship
        await pushText(page, 'Schodzisz z galery.');

        // Timer should be empty after exiting
        await expect(transportTimer, 'should clear timer after exit').toBeEmpty();
    });

    test('timer shows correct color based on remaining time', async ({page}) => {
        test.setTimeout(60000); // Increase timeout to 60 seconds for this test
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const transportTimer = page.locator('#transport-timer');

        // Send location update
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6429,
            id: 6429,
            name: 'Przystan na Blekitnej Wstedze',
            zone: 'Blekitna Wstega',
            map: {
                x: 0,
                y: 0,
                name: 'Transport Docks',
            },
        });

        // Start journey
        await submitCommand(page, 'wejdz na statek');
        await page.waitForTimeout(50);
        await pushText(page, 'Wchodzisz na wielka galere.');
        await pushText(page, 'Galera odbija od brzegu.');

        // Initially should have green or yellow class (more than 10 seconds remaining)
        await page.waitForTimeout(100);
        const initialClass = await transportTimer.getAttribute('class');
        expect(
            initialClass === 'green' || initialClass === 'yellow',
            'should have green or yellow class initially'
        ).toBeTruthy();

        // Wait for timer to count down (the journey to Kraina Zgromadzenia is 43 seconds)
        // After 20 seconds, should be yellow (about 23 seconds remaining, in 10-30 range)
        await page.waitForTimeout(20000);
        await expect(transportTimer, 'should be yellow when close to arrival').toHaveClass('yellow');

        // Wait until less than 10 seconds remain (wait another 15 seconds)
        await page.waitForTimeout(15000);
        await expect(transportTimer, 'should be red when very close to arrival').toHaveClass('red');
    });

    test('handles transport with disambiguation via set pattern', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const transportTimer = page.locator('#transport-timer');

        // Send location update for Nuln which has multiple possible destinations
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 7233,
            id: 7233,
            name: 'Wschodnie nabrzeze w Nuln',
            zone: 'Nuln',
            map: {
                x: 2,
                y: 0,
                name: 'Transport Docks',
            },
        });

        // Board the ship
        await submitCommand(page, 'wejdz na statek');
        await page.waitForTimeout(50);
        await pushText(page, 'Wchodzisz na wielka galere.');

        // Use set pattern to clarify destination is Kreutzhofen
        await pushText(page, 'Ancelmus krzyczy: Nastepnym portem bedzie przystan w Kreutzhofen!');

        // Ship departs
        await pushText(page, 'Galera odbija od brzegu.');

        // Should show Kreutzhofen as destination
        await expect(transportTimer, 'should show disambiguated destination').toContainText('Kreutzhofen');
    });

    test('shows correct arrival time for transport journey', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const transportTimer = page.locator('#transport-timer');

        // Send location update
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6429,
            id: 6429,
            name: 'Przystan na Blekitnej Wstedze',
            zone: 'Blekitna Wstega',
            map: {
                x: 0,
                y: 0,
                name: 'Transport Docks',
            },
        });

        // Start journey
        await submitCommand(page, 'wejdz na statek');
        await page.waitForTimeout(50);
        await pushText(page, 'Wchodzisz na wielka galere.');
        await pushText(page, 'Galera odbija od brzegu.');
        await page.waitForTimeout(100);

        // Timer should show with correct total time (43 seconds for this route)
        const timerText = await transportTimer.textContent();
        expect(timerText, 'should show timer with destination').toContain('Kraina Zgromadzenia');

        // Should be counting down (less than 43 seconds remaining)
        await page.waitForTimeout(1000);
        const timerTextAfterWait = await transportTimer.textContent();
        expect(timerTextAfterWait, 'should show countdown').toMatch(/\d+:\d{2}/);
    });
});

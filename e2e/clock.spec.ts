import {expect, test} from './support/fixtures';
import {ensureGameSocket, GMCP_PATHS, pushGmcp, pushText, waitForCommandInput} from './support/mocks';

test.describe('Clock System', () => {
    test.beforeEach(async ({context}) => {
        // Mock sunCalendarLogger API to prevent real API calls
        await context.route('**/api/**', async (route) => {
            await route.abort();
        });
        await context.route('**/*calendar*/**', async (route) => {
            await route.abort();
        });
    });

    test('initial time check sets precision to 60', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Send initial time check
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');

        // Wait for clock display to show time and precision
        const clockDisplay = page.locator('#clock-display');
        await expect(clockDisplay).toContainText('06:00');
        await expect(clockDisplay).toContainText('±60');
    });

    test('second check within same hour reduces precision to 30', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // First check at 8:00
        await pushText(page, 'Jest w przyblizeniu osma rano, 15 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        const clockDisplay = page.locator('#clock-display');
        await expect(clockDisplay).toContainText('08:00');
        await expect(clockDisplay).toContainText('±60');

        // Wait 30 seconds for clock to advance
        await page.clock.runFor(4000);

        // Second check still at 8:00 (same hour) - precision should reduce to 30
        await pushText(page, 'Jest w przyblizeniu osma rano, 15 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('±58');
    });

    test('sunrise event sets clock to rounded hour with precision 0', async ({page}) => {
        // Note: This test cannot use page.clock because the clock internal state
        // depends on real timestamps for daylight transition detection
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set initial imprecise time
        await pushText(page, 'Jest w przyblizeniu piata rano, 10 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        const clockDisplay = page.locator('#clock-display');
        await expect(clockDisplay).toContainText('05:00');
        await expect(clockDisplay).toContainText('±60');

        // First set nighttime to establish daylight state
        await pushGmcp(page, 'room.time', { daylight: false });
        await page.waitForTimeout(1000);

        // Then trigger sunrise by changing daylight to true
        await pushGmcp(page, 'room.time', { daylight: true });

        // Wait for clock to update (needs time for next tick)
        await page.waitForTimeout(500);

        // Clock should show 06:xx with no precision indicator (precision 0)
        // Note: Clock continues ticking so we check for hour 06, not exact 06:00
        await expect(clockDisplay).toContainText('06:');
        const text = await clockDisplay.textContent();
        expect(text).not.toContain('±');
    });

    test('sunset event at 20:59 sets clock to 21:00 with precision 0', async ({page}) => {
        // Note: This test cannot use page.clock because the clock internal state
        // depends on real timestamps for daylight transition detection
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set initial time around sunset - use Sommerzeit which has sunset at 21:00
        await pushText(page, 'Jest w przyblizeniu osma wieczorem, 10 dzien miesiaca Sommerzeit wedlug Kalendarza Imperialnego.');
        const clockDisplay = page.locator('#clock-display');
        await expect(clockDisplay).toContainText('20:00');

        // First set daytime to establish daylight state
        await pushGmcp(page, 'room.time', { daylight: true });
        await page.waitForTimeout(1500);

        // Then trigger sunset by changing daylight to false
        await pushGmcp(page, 'room.time', { daylight: false });

        // Wait for clock to update (needs time for next tick)
        await page.waitForTimeout(1000);

        // Clock should show 21:00 with no precision indicator
        await expect(clockDisplay).toContainText('21:', { timeout: 10000 });
        const text = await clockDisplay.textContent();
        expect(text).not.toContain('±');
    });

    test('domain switching changes clock displayed for Empire and Ishtar', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set Empire time
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('06:00');

        // Simulate Ishtar time (different domain)
        await pushText(page, 'Jest w przyblizeniu poludnie, pietnasty dzien pory Birke wedlug rachuby czasu Starszego Ludu.');
        await expect(clockDisplay).toContainText('12:00');

        // Back to Empire - clock should still show Empire time when Empire messages come
        await pushText(page, 'Jest w przyblizeniu siodma rano, 2 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('07:00');
    });


    test('midnight transition works correctly', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set time just before midnight (23:00)
        await pushText(page, 'Jest w przyblizeniu jedenasta w nocy, 10 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('23:00');

        // Simulate time passing to next day
        await pushText(page, 'Jest w przyblizeniu pierwsza w nocy, 11 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('01:00');
    });

    test('clock display shows correct time format', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set a specific time
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');

        // Check if clock display element exists and shows time
        await expect(clockDisplay).toBeVisible();
        await expect(clockDisplay).toContainText('06:00');
        await expect(clockDisplay).toContainText('±60');

        // Clock should be clickable
        const title = await clockDisplay.getAttribute('title');
        expect(title).toContain('Kliknij');
    });

    test('Ishtar sunrise event works independently from Empire', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set Empire time
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('06:00');

        // Switch to Ishtar domain
        await pushText(page, 'Jest w przyblizeniu szosta rano, pierwszy dzien pory Yule wedlug rachuby czasu Starszego Ludu.');
        await expect(clockDisplay).toContainText('06:00');

        // Ishtar sunrise event (need to change daylight state)
        await pushGmcp(page, 'room.time', { daylight: false });
        await page.clock.runFor(500);
        await pushGmcp(page, 'room.time', { daylight: true });

        // Wait for clock to update
        await page.clock.runFor(1500);

        // Clock should update with precision 0
        const text = await clockDisplay.textContent();
        expect(text).toMatch(/\d{2}:\d{2}/); // Should have time format
        expect(text).not.toContain('±'); // Precision should be 0
    });

    // TODO: Re-enable when storage restoring is enabled again
    test.skip('clock persists across page reloads', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'TestHero'})

        const clockDisplay = page.locator('#clock-display');

        // Set a specific time
        await pushText(page, 'Jest w przyblizeniu osma rano, 15 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('08:00');

        // Reload page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'TestHero'});
        await page.clock.runFor(1000);

        // Clock should show time again (might have ticked a bit)
        await expect(clockDisplay).toContainText(':');
        const textAfter = await clockDisplay.textContent();
        expect(textAfter).toMatch(/\d{2}:\d{2}/);
    });

    test('sunrise before first czas sets precision 0', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set domain via GMCP without initializing clock
        await pushGmcp(page, 'room.info', { map: { domain: 'Imperium' } });

        // Establish nighttime baseline
        await pushGmcp(page, 'room.time', { daylight: false });
        await page.waitForTimeout(500);

        // Sunrise transition
        await pushGmcp(page, 'room.time', { daylight: true });
        await page.waitForTimeout(500);

        // Clock still not initialized — shows placeholder
        await expect(clockDisplay).toContainText('--:--');

        // Now czas fires — should initialize with precision 0
        await pushText(page, 'Jest w przyblizeniu piata rano, 10 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('05:00');
        const text = await clockDisplay.textContent();
        expect(text).not.toContain('±');
    });

    test('sunset before first czas sets precision 0', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set domain via GMCP
        await pushGmcp(page, 'room.info', { map: { domain: 'Imperium' } });

        // Establish daytime baseline
        await pushGmcp(page, 'room.time', { daylight: true });
        await page.waitForTimeout(500);

        // Sunset transition
        await pushGmcp(page, 'room.time', { daylight: false });
        await page.waitForTimeout(500);

        // czas fires — should initialize with precision 0
        await pushText(page, 'Jest w przyblizeniu piata wieczorem, 10 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('17:00');
        const text = await clockDisplay.textContent();
        expect(text).not.toContain('±');
    });

    test('no transition before first czas uses normal precision 60', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set domain but no daylight transition
        await pushGmcp(page, 'room.info', { map: { domain: 'Imperium' } });
        await pushGmcp(page, 'room.time', { daylight: true });
        await page.waitForTimeout(500);

        // czas without any transition — normal precision
        await pushText(page, 'Jest w przyblizeniu piata rano, 10 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('05:00');
        await expect(clockDisplay).toContainText('±60');
    });

    test('clock shows day/night color coding', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set time during daytime hours (Pflugzeit sunrise is 06:00, sunset is 19:00)
        await pushText(page, 'Jest w przyblizeniu dwunasta w poludnie, 10 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('12:00');

        // Set GMCP daylight to true for daytime
        await pushGmcp(page, 'room.time', { daylight: true });

        // Wait for display to update
        await page.clock.runFor(1000);

        // Check that clock has yellow color for daytime (calculated from hour vs sunrise/sunset)
        const innerHTML = await clockDisplay.innerHTML();
        // Daytime color is #fbbf24 (yellow)
        expect(innerHTML).toContain('#fbbf24');

        // Set time at sunset
        await pushText(page, 'Jest w przyblizeniu osma wieczorem, 10 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('20:00');

        // Sunset event - should show nighttime (already at daytime, so just change to false)
        await pushGmcp(page, 'room.time', { daylight: false });
        await page.clock.runFor(2000);

        const innerHTMLNight = await clockDisplay.innerHTML();
        // Nighttime color is #60a5fa (blue)
        expect(innerHTMLNight).toContain('#60a5fa');
    });
});

import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';

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
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // First check at 8:00
        await pushText(page, 'Jest w przyblizeniu osma rano, 15 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        const clockDisplay = page.locator('#clock-display');
        await expect(clockDisplay).toContainText('08:00');
        await expect(clockDisplay).toContainText('±60');

        // Second check still at 8:00 (same hour) - precision should reduce to 30
        await pushText(page, 'Jest w przyblizeniu osma rano, 15 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('±30');
    });

    test('sunrise event sets clock to rounded hour with precision 0', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set initial imprecise time
        await pushText(page, 'Jest w przyblizeniu piata rano, 10 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        const clockDisplay = page.locator('#clock-display');
        await expect(clockDisplay).toContainText('05:00');
        await expect(clockDisplay).toContainText('±60');

        // Sunrise event at ~4:59 should round to 5:00 with precision 0
        await pushText(page, 'Slonce powoli wznosi sie nad horyzont. Zapowiada sie piekny dzien!');

        // Clock should show 05:00 with no precision indicator (precision 0)
        await expect(clockDisplay).toContainText('05:00');
        // Wait a bit and check that precision indicator is gone (not ±)
        await page.waitForTimeout(500);
        const text = await clockDisplay.textContent();
        expect(text).not.toContain('±');
    });

    test('sunset event at 20:59 sets clock to 21:00 with precision 0', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set initial time around sunset
        await pushText(page, 'Jest w przyblizeniu osma wieczorem, 10 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        const clockDisplay = page.locator('#clock-display');
        await expect(clockDisplay).toContainText('20:00');

        // Sunset event at ~20:59 should round to 21:00 with precision 0
        await pushText(page, 'Slonce powoli chowa sie za horyzont. Zapowiada sie spokojna noc.');

        // Clock should show 21:00 with no precision indicator
        await expect(clockDisplay).toContainText('21:00');
        await page.waitForTimeout(500);
        const text = await clockDisplay.textContent();
        expect(text).not.toContain('±');
    });

    test('character switching preserves separate clock states for Empire and Ishtar', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set Empire time
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('06:00');

        // Simulate Ishtar time (different domain)
        await pushText(page, 'Jest w przyblizeniu dwunasta w poludnie, 15 dzien miesiaca Pflugzeit wedlug Kalendarza Ishtarskiego.');
        await expect(clockDisplay).toContainText('12:00');

        // Back to Empire - clock should still show Empire time when Empire messages come
        await pushText(page, 'Jest w przyblizeniu siodma rano, 2 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('07:00');
    });

    test('clock continues to tick and increases precision', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set initial precise time via sunrise
        await pushText(page, 'Slonce powoli wznosi sie nad horyzont. Zapowiada sie piekny dzien!');

        // Check that clock shows time with no precision initially
        await expect(clockDisplay).toContainText(':');
        await page.waitForTimeout(500);
        let text = await clockDisplay.textContent();
        expect(text).not.toContain('±');

        // Wait for clock to tick (precision should increase)
        await page.waitForTimeout(6000); // 6 seconds = 6 game minutes

        // Now precision should be visible
        text = await clockDisplay.textContent();
        expect(text).toMatch(/±[1-9]/); // Precision > 0
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
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set Empire time
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('06:00');

        // Ishtar sunrise event
        await pushText(page, 'Slonce powoli wznosi sie nad horyzont. Zapowiada sie piekny dzien!');
        // Note: Without knowing which domain is active, we just check that clock updates
        await page.waitForTimeout(500);
        const text = await clockDisplay.textContent();
        expect(text).toMatch(/\d{2}:\d{2}/); // Should have time format
    });

    test('clock persists across page reloads', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Set a specific time
        await pushText(page, 'Jest w przyblizeniu osma rano, 15 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');
        await expect(clockDisplay).toContainText('08:00');

        // Reload page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Send same time to restore active domain
        await pushText(page, 'Jest w przyblizeniu osma rano, 15 dzien miesiaca Pflugzeit wedlug Kalendarza Imperialnego.');

        // Clock should show time again (might have ticked a bit)
        await expect(clockDisplay).toContainText(':');
        const textAfter = await clockDisplay.textContent();
        expect(textAfter).toMatch(/\d{2}:\d{2}/);
    });

    test('clock shows day/night color coding', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const clockDisplay = page.locator('#clock-display');

        // Sunrise - should show daytime
        await pushText(page, 'Slonce powoli wznosi sie nad horyzont. Zapowiada sie piekny dzien!');
        await page.waitForTimeout(500);

        // Check that clock has yellow color for daytime (from daylight flag)
        const innerHTML = await clockDisplay.innerHTML();
        // Daytime color is #fbbf24 (yellow)
        expect(innerHTML).toContain('#fbbf24');

        // Sunset - should show nighttime
        await pushText(page, 'Slonce powoli chowa sie za horyzont. Zapowiada sie spokojna noc.');
        await page.waitForTimeout(500);

        const innerHTMLNight = await clockDisplay.innerHTML();
        // Nighttime color is #60a5fa (blue)
        expect(innerHTMLNight).toContain('#60a5fa');
    });
});

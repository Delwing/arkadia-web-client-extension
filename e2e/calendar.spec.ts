import { expect, test } from './support/fixtures';
import { ensureGameSocket, pushText, submitCommand, waitForCommandInput } from './support/mocks';

/** 18 Erntezeit, 8 in the morning - day 251 of the Empire year. */
const CZAS_REPLY =
    'Jest w przyblizeniu osma rano, osiemnasty dzien miesiaca Erntezeit wedlug Kalendarza Imperialnego.';

// The alias is deliberately undocumented and absent from the right-click menu,
// so driving it by command is the only way in.
test.describe('Calendar popup', () => {
    test.beforeEach(async ({ context }) => {
        await context.route('**/api/**', (route) => route.abort());
    });

    test('renders the in-game year once the clock is synced', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushText(page, CZAS_REPLY);

        await submitCommand(page, '/kalendarz');

        await expect(page.locator('text=Kalendarz roku').first()).toBeVisible();

        // every Empire month gets its own section
        for (const month of ['Nachhexen', 'Sonnenstill', 'Erntezeit', 'Vorhexen']) {
            await expect(page.locator(`text=${month}`).first()).toBeVisible();
        }

        // the summary names the synced day, its season and its real-world placing
        await expect(page.locator('text=18 Erntezeit').first()).toBeVisible();
        await expect(page.locator('text=Jesien').first()).toBeVisible();
        await expect(page.locator('text=Czas RL').first()).toBeVisible();
        await expect(page.locator('text=Geheimnisnacht').first()).toBeVisible();

        // the year switch previews the following in-game year
        await expect(page.locator('text=ten rok').first()).toBeVisible();
        await page.locator('button[title="Nastepny rok IG"]').click();
        await expect(page.locator('text=rok +1').first()).toBeVisible();
        await page.locator('button[title="Poprzedni rok IG"]').click();
        await expect(page.locator('text=ten rok').first()).toBeVisible();
    });

    test('waits for the clock before drawing anything', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await submitCommand(page, '/kalendarz');

        await expect(page.locator('text=Czekam na odczyt zegara').first()).toBeVisible();
    });

    test('stays off the right-click menu', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await page.locator('#main_text_output_msg_wrapper').click({ button: 'right' });

        // the menu really is open - otherwise the assertions below prove nothing
        await expect(page.locator('text=Depozyty').first()).toBeVisible();

        // ...and neither undocumented window is reachable from it
        await expect(page.locator('text=Kalendarz roku')).toHaveCount(0);
        await expect(page.locator('button[title="Nastepny rok IG"]')).toHaveCount(0);
    });
});

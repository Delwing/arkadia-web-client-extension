import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput, waitForOutputContaining} from './support/mocks';

/**
 * The game warns how long a spell has left as it wears off; each warning puts up
 * (or re-syncs) a footer chip counting down to its end.
 */
test.describe('Spell effect chips', () => {
    test('counts down from a warning and goes when the spell ends', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const chip = page.locator('#spell-effects .chip');
        await expect(chip).toHaveCount(0);

        await pushText(page, "Czujesz, ze efekt dzialania czaru 'przeobrazenie' powoli slabnie, ale powinien sie jeszcze utrzymac przez dosc krotki czas.");
        await waitForOutputContaining(page, '[ CZAR ] Czujesz, ze efekt dzialania czaru');
        await expect(chip.locator('.chip__lab')).toHaveText('przeobrazenie');
        await expect(chip.locator('.chip__val')).toHaveText(/^[01]:[0-9]{2}$/);
        await expect(chip).toHaveClass(/chip--warn/);

        await pushText(page, "Czujesz, ze efekt dzialania czaru 'przeobrazenie' konczy sie, a twoj wyglad powraca do normy.");
        await expect(chip).toHaveCount(0);
    });
});

import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';

test.describe('Cover timer', () => {
    // The cover cooldown is the "Zaslona" footer chip (#release-guard-timer):
    // "OK" in the ok tone when ready, a countdown ("4.9") in the warn tone while recharging.

    test('starts countdown after successful cover', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const chip = page.locator('#release-guard-timer .chip');
        const value = chip.locator('.chip__val');

        await expect(chip.locator('.chip__lab'), 'should be the cover chip').toHaveText('Zaslona');
        await expect(value, 'should display OK initially').toHaveText('OK');
        await expect(chip, 'should be in the ready tone').toHaveClass(/chip--ok/);

        await pushText(page, 'Zrecznie zaslaniasz Aldousa przed ciosami orka.');

        await expect(value, 'should show countdown value').toHaveText(/^[0-9]\.[0-9]$/);
        await expect(chip, 'should be in the warn tone while recharging').toHaveClass(/chip--warn/);
    });

    test('starts countdown after failed cover attempt', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const chip = page.locator('#release-guard-timer .chip');

        await pushText(page, 'Probujesz zaslonic Berenika przed ciosami goblina, jednak nie jestes w stanie tego uczynic.');

        await expect(chip.locator('.chip__val'), 'should count down even on failure').toHaveText(/^[0-9]\.[0-9]$/);
        await expect(chip).toHaveClass(/chip--warn/);
    });

    test('returns to ready state after timer expires', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const chip = page.locator('#release-guard-timer .chip');

        await pushText(page, 'Z wprawa stajesz pomiedzy Cedrikiem a trolem, przyjmujac na siebie nadchodzace ciosy.');
        await expect(chip, 'should count down').toHaveClass(/chip--warn/);

        // 5 second timer + buffer
        await page.clock.runFor(5500);

        await expect(chip.locator('.chip__val'), 'should return to ready state').toHaveText('OK');
        await expect(chip).toHaveClass(/chip--ok/);
    });

    test('starts countdown for guard position with weapon', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const chip = page.locator('#release-guard-timer .chip');

        await pushText(page, 'Unosisz swoja szable i szybko przesuwasz sie za Dagne, kryjac sie przed atakami');

        await expect(chip.locator('.chip__val'), 'should count down for weapon cover').toHaveText(/^[0-9]\.[0-9]$/);
        await expect(chip).toHaveClass(/chip--warn/);
    });
});

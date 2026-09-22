import {expect, test} from './support/fixtures';
import {ensureGameSocket, getLastOutgoingCommand, pushText, waitForCommandInput} from './support/mocks';

/**
 * The footer lamp readout is the shared <LampChip> (src/ui/web/footer/chips.tsx),
 * the same component the forge HUD renders — so it is always on screen and says
 * "off" when the lamp is out, rather than disappearing. Clicking it lights
 * or snuffs the lamp.
 */
test.describe('Lamp timer', () => {
    const open = async (page: import('@playwright/test').Page, withClock = false) => {
        if (withClock) await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        return {
            chip: page.locator('#lamp-timer .chip'),
            label: page.locator('#lamp-timer .chip__lab'),
            value: page.locator('#lamp-timer .chip__val'),
        };
    };

    test('is on screen before the lamp is ever lit', async ({page}) => {
        const {chip, label, value} = await open(page);

        await expect(chip, 'chip should be present from the start').toBeVisible();
        await expect(label).toHaveText('Lampa');
        await expect(value, 'an unlit lamp reads "off"').toHaveText('off');
    });

    test('shows the countdown when the lamp is lit', async ({page}) => {
        const {chip, value} = await open(page);

        await pushText(page, 'Zapalasz swoja lampe.');

        await expect(value, 'should count down from 5:00').toHaveText(/^[0-9]:[0-9]{2}$/);
        await expect(chip, 'should be green at 300 seconds').toHaveClass(/chip--ok/); // springgreen
    });

    test('changes to yellow when below 60 seconds', async ({page}) => {
        const {chip, value} = await open(page, true);

        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);

        // 300 - 241 = 59 seconds remaining
        await page.clock.runFor(241000);

        await expect(chip, 'should be yellow below 60 seconds').toHaveClass(/chip--warn/); // yellow
    });

    test('changes to red when below 30 seconds', async ({page}) => {
        const {chip, value} = await open(page, true);

        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);

        // 300 - 271 = 29 seconds remaining
        await page.clock.runFor(271000);

        await expect(chip, 'should be red below 30 seconds').toHaveClass(/chip--danger/); // tomato
    });

    test('goes back to "off" when the lamp is extinguished', async ({page}) => {
        const {chip, value} = await open(page);

        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);

        await pushText(page, 'Gasisz swoja lampe.');

        await expect(value).toHaveText('off');
        await expect(chip, 'the chip itself stays on screen').toBeVisible();
    });

    test('goes back to "off" when the lamp runs out of oil', async ({page}) => {
        const {chip, value} = await open(page);

        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);

        await pushText(page, 'lampa wypala sie i gasnie.');

        await expect(value).toHaveText('off');
    });

    test('resets when lamp is refilled', async ({page}) => {
        const {chip, value} = await open(page, true);

        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);

        // 300 - 250 = 50 seconds remaining
        await page.clock.runFor(250000);
        const toSeconds = (text: string | null) => {
            const m = text?.match(/^([0-9]):([0-9]{2})$/);
            return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
        };
        const before = toSeconds(await value.textContent());

        await pushText(page, 'Dopelniasz swoja lampe oleju.');
        await page.clock.runFor(1000);

        expect(toSeconds(await value.textContent()), 'should have more time after refill').toBeGreaterThan(before);
    });

    test('clicking lights the lamp and then snuffs it', async ({page}) => {
        const {chip, value} = await open(page);

        await chip.click();
        expect(await getLastOutgoingCommand(page), 'an unlit lamp is lit').toBe('zapal lampe');

        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);

        await chip.click();
        expect(await getLastOutgoingCommand(page), 'a lit lamp is snuffed').toBe('zgas lampe');
    });

    for (const lit of [false, true]) {
        test(`long press refills the lamp when it is ${lit ? 'lit' : 'off'}`, async ({page}) => {
            const {chip, value} = await open(page);
            if (lit) {
                await pushText(page, 'Zapalasz swoja lampe.');
                await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);
            }

            await chip.hover();
            await page.mouse.down();
            await expect(chip, 'the hold shows its progress').toHaveClass(/chip--holding/);
            await expect(chip, 'the hold lands').toHaveClass(/chip--held/);
            await page.mouse.up();

            expect(await getLastOutgoingCommand(page), 'a hold always refills').toBe('napelnij lampe olejem');
        });
    }

    test('releasing early does not refill', async ({page}) => {
        const {chip} = await open(page);

        await chip.hover();
        await page.mouse.down();
        await expect(chip).toHaveClass(/chip--holding/);
        await page.mouse.up();

        expect(await getLastOutgoingCommand(page), 'a short press is a plain click').toBe('zapal lampe');
        await expect(chip).not.toHaveClass(/chip--holding|chip--held/);
    });
});

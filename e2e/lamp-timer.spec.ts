import {expect, test} from './support/fixtures';
import {ensureGameSocket, getLastOutgoingCommand, pushText, waitForCommandInput} from './support/mocks';

/**
 * The footer lamp readout is the shared <LampChip> (src/ui/web/footer/chips.tsx),
 * the same component the forge HUD renders — so it is always on screen and says
 * "zgaszona" when the lamp is out, rather than disappearing. Clicking it lights
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
        await expect(value, 'an unlit lamp reads "zgaszona"').toHaveText('zgaszona');
    });

    test('shows the countdown when the lamp is lit', async ({page}) => {
        const {value} = await open(page);

        await pushText(page, 'Zapalasz swoja lampe.');

        await expect(value, 'should count down from 5:00').toHaveText(/^[0-9]:[0-9]{2}$/);
        await expect(value, 'should be green at 300 seconds').toHaveCSS('color', 'rgb(0, 255, 127)'); // springgreen
    });

    test('changes to yellow when below 60 seconds', async ({page}) => {
        const {value} = await open(page, true);

        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);

        // 300 - 241 = 59 seconds remaining
        await page.clock.runFor(241000);

        await expect(value, 'should be yellow below 60 seconds').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow
    });

    test('changes to red when below 30 seconds', async ({page}) => {
        const {value} = await open(page, true);

        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);

        // 300 - 271 = 29 seconds remaining
        await page.clock.runFor(271000);

        await expect(value, 'should be red below 30 seconds').toHaveCSS('color', 'rgb(255, 99, 71)'); // tomato
    });

    test('goes back to "zgaszona" when the lamp is extinguished', async ({page}) => {
        const {chip, value} = await open(page);

        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);

        await pushText(page, 'Gasisz swoja lampe.');

        await expect(value).toHaveText('zgaszona');
        await expect(chip, 'the chip itself stays on screen').toBeVisible();
    });

    test('goes back to "zgaszona" when the lamp runs out of oil', async ({page}) => {
        const {value} = await open(page);

        await pushText(page, 'Zapalasz swoja lampe.');
        await expect(value).toHaveText(/^[0-9]:[0-9]{2}$/);

        await pushText(page, 'lampa wypala sie i gasnie.');

        await expect(value).toHaveText('zgaszona');
    });

    test('resets when lamp is refilled', async ({page}) => {
        const {value} = await open(page, true);

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
});

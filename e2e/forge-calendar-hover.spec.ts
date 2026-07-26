import { expect, test } from './support/fixtures';
import { ensureGameSocket, pushText } from './support/mocks';

/**
 * Kalendarz (sun tracker) in forge-ui: the day-cell hover tooltip is
 * `position: fixed` at viewport coordinates. forge puts a `filter` on
 * `.dockable-popup-body`, which makes that element the containing block for
 * fixed descendants — rendered in place, the tooltip was offset by the popup's
 * own origin AND inflated the body's scroll area, so hovering a day toggled
 * scrollbars, reflowed the grid under the cursor and flickered. The overlay is
 * portaled to <body> to keep it out of the popup's layout.
 */
test.describe('forge kalendarz hover', () => {
    test('day hover does not reflow the popup body', async ({ page }) => {
        await page.goto('/forge-ui/');
        // Connect from the gate (forge has no stock #connect-button), then let
        // the shared helper wait for the mock socket.
        await page.locator('.gate__quiet').click();
        await ensureGameSocket(page);

        // Open the calendar via its alias.
        const input = page.locator('#alt-input');
        await input.fill('/slonce');
        await input.press('Enter');

        const body = page.locator('.dockable-popup-body.sun-tracker-window-body');
        await expect(body).toBeVisible();

        // Give the popup a clock (the tooltip only renders with one).
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');

        const before = await body.evaluate((el) => ({
            w: el.scrollWidth, h: el.scrollHeight, cw: el.clientWidth,
        }));

        // Hover a day cell in the first visible month grid.
        const day = body.locator('div[style*="grid-template-columns"] > div').first();
        await day.hover();

        // Portaled out of the popup: a <body> child, not inside the popup body.
        const tooltip = page.locator('body > [data-popup-overlay]');
        await expect(tooltip).toBeVisible();

        const after = await body.evaluate((el) => ({
            w: el.scrollWidth, h: el.scrollHeight, cw: el.clientWidth,
        }));
        expect(after).toEqual(before);
    });
});

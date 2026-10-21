import { expect, test } from './support/fixtures';
import { ensureGameSocket, pushText, submitCommand, waitForCommandInput } from './support/mocks';

const MENU = '#context-menu';

test.describe('Widgets', () => {
    test('add a clock, move it to another corner, keep it after a reload, remove it', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');

        await submitCommand(page, '/widzety');
        const toolbar = page.locator('.widget-toolbar');
        await expect(toolbar).toBeVisible();

        await toolbar.getByRole('button', { name: 'Dodaj' }).click();
        await page.locator(MENU).getByText('Zegar', { exact: true }).click();

        const clock = page.locator('.widget-frame[data-widget-type="clock"]');
        await expect(clock).toBeVisible();
        await expect(clock).toContainText('06:00');
        await expect(clock).toHaveAttribute('data-corner', 'tr');

        // Drag it into the bottom-left part of the output.
        const area = (await page.locator('#main_text_output_msg_wrapper').boundingBox())!;
        const box = (await clock.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(area.x + 120, area.y + area.height - 80, { steps: 8 });
        await page.mouse.up();
        await expect(clock).toHaveAttribute('data-corner', 'bl');

        await toolbar.getByRole('button', { name: 'Gotowe' }).click();
        await expect(toolbar).toBeHidden();

        await page.reload();
        await waitForCommandInput(page);
        await expect(clock).toHaveAttribute('data-corner', 'bl');
        await expect(clock).toBeVisible();

        await clock.click({ button: 'right' });
        await page.locator(MENU).getByText('Usuń', { exact: true }).click();
        await expect(clock).toHaveCount(0);
    });

    test('a widget setting from its right-click menu sticks to that widget', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await submitCommand(page, '/widzety');
        await page.locator('.widget-toolbar').getByRole('button', { name: 'Dodaj' }).click();
        await page.locator(MENU).getByText('Zegar', { exact: true }).click();
        await page.keyboard.press('Escape');
        await expect(page.locator('.widget-toolbar')).toBeHidden();

        const clock = page.locator('.widget-frame[data-widget-type="clock"]');
        await expect(clock.locator('.wt-domain')).toHaveCount(1);

        await clock.click({ button: 'right' });
        await page.locator(MENU).getByText('Obie', { exact: true }).click();
        await expect(clock.locator('.wt-domain')).toHaveCount(2);
    });
});

import { expect, test } from './support/fixtures';
import { ensureGameSocket, getCommandLog, resetCommandLog, waitForCommandInput } from './support/mocks';

const desktopButtonSettings = {
    buttons: [
        {
            id: 'desktop-btn-focus',
            label: 'Rozejrzyj',
            macroType: 'command',
            command: 'rozejrzyj sie',
            color: '#0d6efd',
            fontColor: '#f1f5f9',
            fontSize: 11,
            width: 80,
            height: 36,
            x: 120,
            y: 120,
            backgroundOpacity: 0.85,
        },
    ],
    locked: true,
};

test.describe('Desktop button focus handling', () => {
    const prepare = async ({ page }: { page: import('@playwright/test').Page }) => {
        await page.addInitScript((settings) => {
            localStorage.setItem('desktopButtonSettings', JSON.stringify(settings));
        }, desktopButtonSettings);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    };

    test.describe('mouse interaction', () => {
        test.beforeEach(async ({ page }) => {
            await page.setViewportSize({ width: 1280, height: 900 });
            await prepare({ page });
        });

        test('clicking a desktop button leaves the command input focused', async ({ page }) => {
            const input = page.locator('#message-input');
            await input.focus();
            await resetCommandLog(page);

            const desktopBtn = page.locator('#desktop-buttons-container .desktop-button').first();
            await expect(desktopBtn).toBeVisible();
            await desktopBtn.click();

            await expect.poll(
                async () => await getCommandLog(page),
                { message: 'button macro should have run', timeout: 5000 },
            ).toContain('rozejrzyj sie');

            await expect.poll(
                async () => await page.evaluate(() => document.activeElement?.id ?? ''),
                { message: 'focus should stay on the command input', timeout: 2000 },
            ).toBe('message-input');

            // The real symptom: typing right after a button press must reach the command line.
            await page.keyboard.type('polnoc');
            await expect(input).toHaveValue('polnoc');
        });
    });

    test.describe('touch interaction', () => {
        test.use({ hasTouch: true });

        test.beforeEach(async ({ page }) => {
            await page.setViewportSize({ width: 420, height: 860 });
            await prepare({ page });
        });

        test('tapping a desktop button does not pull focus back to the command input', async ({ page }) => {
            const input = page.locator('#message-input');
            await input.focus();
            await resetCommandLog(page);

            const desktopBtn = page.locator('#desktop-buttons-container .desktop-button').first();
            await expect(desktopBtn).toBeVisible();
            await desktopBtn.tap();

            await expect.poll(
                async () => await getCommandLog(page),
                { message: 'button macro should have run', timeout: 5000 },
            ).toContain('rozejrzyj sie');

            // Holding the command input focused is what summons the on-screen
            // keyboard over half the screen, so a tap must let focus go.
            await expect.poll(
                async () => await page.evaluate(() => document.activeElement?.id ?? ''),
                { message: 'focus should leave the command input on touch', timeout: 2000 },
            ).not.toBe('message-input');
        });
    });
});

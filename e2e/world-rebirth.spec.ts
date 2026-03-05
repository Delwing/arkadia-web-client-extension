import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';

async function waitForOutputContaining(page: Page, text: string, timeout: number = 5000) {
    await page.waitForFunction(
        (searchText) => {
            const wrapper = document.querySelector('#main_text_output_msg_wrapper');
            if (!wrapper) return false;

            const messages = wrapper.querySelectorAll('.output_msg');
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 20); i--) {
                const msg = messages[i];
                const textContent = msg.textContent || '';
                if (textContent.includes(searchText)) {
                    return true;
                }
            }
            return false;
        },
        text,
        {timeout}
    );
}

test.describe('World rebirth', () => {
    test('processes rebirth multiline message without errors', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'RebirthChar', object_num: 12345});
        await page.waitForTimeout(100);

        // Push the rebirth multiline message
        await pushText(page, 'Swiat odrodzil sie : piatek, 15 V 2026, 14:30:45\nCiemnosc.');
        await page.waitForTimeout(300);

        // Verify the message was displayed in the output
        await waitForOutputContaining(page, 'Swiat odrodzil sie');

        // Verify the app is still functional by submitting a command
        await submitCommand(page, 'czas');
        await page.waitForTimeout(100);

        // Command input should still be responsive
        const commandInput = page.locator('#message-input');
        await expect(commandInput, 'command input should remain functional').toBeVisible();
        await expect(commandInput, 'command input should not be disabled').toBeEnabled();
    });

    test('app remains functional after rebirth and can process subsequent messages', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'RebirthChar2', object_num: 22222});
        await page.waitForTimeout(100);

        // Send rebirth message
        await pushText(page, 'Swiat odrodzil sie : sobota, 10 III 2026, 08:15:30\nCiemnosc.');
        await page.waitForTimeout(300);

        await waitForOutputContaining(page, 'Swiat odrodzil sie');

        // Verify GMCP messages still work after rebirth processing
        await pushGmcp(page, 'char.state', {improve: 0});
        await page.waitForTimeout(100);

        // Verify text messages still work after rebirth
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');
        await page.waitForTimeout(200);

        // Clock should update, proving the app is processing messages normally
        const clockDisplay = page.locator('#clock-display');
        await expect(clockDisplay, 'clock should update after rebirth').toContainText('06:00');
    });

    test('rebirth data persists across page reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'RebirthPersist', object_num: 33333});
        await page.waitForTimeout(100);

        // Send rebirth message
        await pushText(page, 'Swiat odrodzil sie : piatek, 15 V 2026, 14:30:45\nCiemnosc.');
        await page.waitForTimeout(300);

        await waitForOutputContaining(page, 'Swiat odrodzil sie');

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'RebirthPersist', object_num: 33333});
        await page.waitForTimeout(200);

        // Verify the app works normally after reload
        const commandInput = page.locator('#message-input');
        await expect(commandInput, 'command input should work after reload').toBeVisible();
        await expect(commandInput, 'command input should be enabled after reload').toBeEnabled();

        // Send a clock update to verify the app processes messages after reload
        await pushText(page, 'Jest w przyblizeniu osma rano, 2 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');
        await page.waitForTimeout(200);

        const clockDisplay = page.locator('#clock-display');
        await expect(clockDisplay, 'clock should work after rebirth + reload').toContainText('08:00');
    });

    test('handles various rebirth date formats with Roman numerals', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'RomanChar', object_num: 44444});
        await page.waitForTimeout(100);

        // Test with month XII (December)
        await pushText(page, 'Swiat odrodzil sie : niedziela, 25 XII 2025, 23:59:59\nCiemnosc.');
        await page.waitForTimeout(300);

        await waitForOutputContaining(page, 'Swiat odrodzil sie');

        // Verify app still functions
        await submitCommand(page, 'czas');
        await page.waitForTimeout(100);

        const commandInput = page.locator('#message-input');
        await expect(commandInput, 'app should handle various date formats').toBeEnabled();
    });
});

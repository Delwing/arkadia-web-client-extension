import {expect, test} from './support/fixtures';
import {ensureGameSocket, submitCommand, waitForCommandInput} from './support/mocks';

test.describe('Puszczaj zaslony', () => {
    test('toggles release guard state and displays feedback', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // First toggle: should turn OFF (initial state is ON)
        await submitCommand(page, '/puszczaj');
        await expect(output, 'should display OFF state after first toggle').toContainText(
            'Puszczanie zaslon: OFF'
        );

        // Second toggle: should turn back ON
        await submitCommand(page, '/puszczaj');
        await expect(output, 'should display ON state after second toggle').toContainText(
            'Puszczanie zaslon: ON'
        );

        // Third toggle: should turn OFF again
        await submitCommand(page, '/puszczaj');
        await expect(output, 'should display OFF state after third toggle').toContainText(
            'Puszczanie zaslon: OFF'
        );
    });
});

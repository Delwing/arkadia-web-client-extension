import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, submitCommand, waitForCommandInput} from './support/mocks';

test.describe('Cechy popup', () => {
    test('drops the modifiers warning once login options report them on', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await submitCommand(page, '/cechyw');
        const warning = page.locator('.cechy-popup__warning');
        await expect(warning).toBeVisible();

        // Login order: the allowed values first, then the full option set.
        await pushGmcp(page, 'char.options.info', {state_modifiers: [0, 1]});
        await pushGmcp(page, 'char.options', {state_modifiers: 1, form: 0});

        await expect(warning).toBeHidden();
    });
});

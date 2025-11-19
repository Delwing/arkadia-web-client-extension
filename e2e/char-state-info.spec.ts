import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';

test.describe('Character state info', () => {
    test('updates when state changes', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const stateInfo = page.locator('#state-info');

        // Send initial state
        await pushGmcp(page, 'char.state', {
            state: 'Stoisz',
        });

        await expect(stateInfo, 'should display initial state').toHaveText('Stoisz');

        // Change state
        await pushGmcp(page, 'char.state', {
            state: 'Lezysz',
        });

        // Should update to new state
        await expect(stateInfo, 'should update to new state').toHaveText('Lezysz');
    });

    test('hides when state is not a string', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const stateInfo = page.locator('#state-info');

        // Send state with valid text
        await pushGmcp(page, 'char.state', {
            state: 'Walczysz',
        });

        // Change to non-string value
        await pushGmcp(page, 'char.state', {
            state: null,
        });

        // Should be hidden
        await expect(stateInfo, 'should be hidden when state is null').not.toBeVisible();
    });
});

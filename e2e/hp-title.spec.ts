import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';

test.describe('HP title', () => {
    test('updates page title when HP changes', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await expect(page, 'should include idle title prefix').toHaveTitle('ㅤ Arkadia');

        await pushGmcp(page, 'char.state', {hp: 5});
        await expect(page, 'should show HP value in title').toHaveTitle('ㅤ Arkadia [6/7]');

        await pushGmcp(page, 'char.state', {hp: 2});
        await expect(page, 'should update HP value when it changes').toHaveTitle('ㅤ Arkadia [3/7]');
    });
});

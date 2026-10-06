import {expect, test} from './support/fixtures';
import {ensureGameSocket, getCommandLog, pushGmcp, resetCommandLog, waitForCommandInput} from './support/mocks';

test.describe('Object list clicks during re-render', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, 'char.info', {object_num: 100, name: 'Gracz'});
        await pushGmcp(page, 'objects.nums', [100, 101, 200, 201]);
        await pushGmcp(page, 'objects.data', {
            '100': {desc: 'Gracz', team: true, team_leader: true, hp: 6, attack_num: 200},
            '101': {desc: 'Kompan', team: true, hp: 6, attack_num: false},
            '200': {desc: 'wielki ork', hp: 6, attack_num: 100},
            '201': {desc: 'maly goblin', hp: 6, attack_num: 101},
        });
        await expect(page.locator('#objects-list .target-dot-attack')).toHaveCount(2);
        await resetCommandLog(page);
    });

    async function pressDuring(page: import('@playwright/test').Page, selector: string, update: Record<string, unknown>) {
        const box = (await page.locator(selector).boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        // A hit lands while the button is held - the row is rebuilt under the cursor.
        await pushGmcp(page, 'objects.data', update);
        await page.mouse.up();
    }

    test('leader attack dot still marks the target when the list re-renders mid-click', async ({page}) => {
        await pressDuring(page, '#objects-list .target-dot-attack[data-object-id="200"]', {'200': {hp: 5}});

        await expect.poll(() => getCommandLog(page)).toEqual(['wskaz ob_200 jako cel ataku']);
    });

    test('does nothing when the re-render moves another object under the cursor', async ({page}) => {
        // The goblin starts fighting the player and is no longer listed after the ork.
        await pressDuring(page, '#objects-list .target-dot-attack[data-object-id="200"]', {'200': {attack_num: false}});

        await page.waitForTimeout(300);
        expect(await getCommandLog(page)).toEqual([]);
    });
});

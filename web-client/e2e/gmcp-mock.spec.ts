import {expect, test} from './support/fixtures';
import {ensureGameSocket, GMCP_PATHS, pushGmcp, waitForClientReady} from './support/mocks';

test.describe('GMCP-driven interactions', () => {
    test('renders team members and leader from GMCP updates', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        const attemptedUrls = await page.evaluate(() => {
            const sockets: any[] = (window as any).__mockSockets ?? [];
            return sockets.map((socket) => socket?.url);
        });
        expect(
            attemptedUrls.some((url: string | null | undefined) => typeof url === 'string' && url.includes('arkadia.rpg.pl')),
            'should attempt to connect to Arkadia GMCP endpoint'
        ).toBe(true);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 100 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': { desc: 'Player', team: true, team_leader: true, state: 6 },
            '101': { desc: 'Scout', team: true, state: 3 },
            '102': { desc: 'Bandit', attack_num: 1, state: 1 },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 101, 102]);

        const teamMembers = page.locator('#objects-list .object-desc[data-teammate="true"]');
        await expect(teamMembers, 'should render a single teammate entry').toHaveCount(1);
        await expect(teamMembers.first(), 'should show teammate name from GMCP data').toContainText('Scout');

        const shortcuts = page.locator('#objects-list .object-num');
        await expect(shortcuts.first(), 'should map teammate to shortcut key').toContainText('A');

        const content = page.locator('#objects-list .objects-list-content');
        const healthyBar = content.locator('span[style*="color:springgreen"]').filter({ hasText: '#######' });
        await expect(healthyBar, 'should show healthy teammate health bar').toHaveCount(1);

        const woundedBar = content.locator('span[style*="color:yellow"]').filter({ hasText: '####---' });
        await expect(woundedBar, 'should show wounded opponent health bar').toHaveCount(1);

        const criticalBar = content.locator('span[style*="color:tomato"]').filter({ hasText: '##-----' });
        await expect(criticalBar, 'should show critically wounded opponent health bar').toHaveCount(1);
    });

    test('removes enemies when they disappear from GMCP objects.nums', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Player', object_num: 200 });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '200': { desc: 'Player', team: true, team_leader: true },
            '300': { desc: 'Goblin Scout', attack_num: 1 },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [200, 300]);

        await page.waitForFunction(() => {
            const client: any = (window as any).clientExtension;
            const objects = client?.ObjectManager?.getObjectsOnLocation?.();
            if (!Array.isArray(objects)) {
                return false;
            }
            return objects.some((obj: any) => obj?.desc === 'Goblin Scout');
        });

        const enemies = page.locator('#objects-list .object-desc').filter({ hasText: 'Goblin Scout' });
        await expect(enemies, 'should render GMCP-listed enemy before removal').toHaveCount(1);

        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [200]);
        await expect(enemies, 'should remove enemy when omitted from GMCP update').toHaveCount(0);
    });
});

import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    GMCP_PATHS,
    pushGmcp,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

const POSLAN_MAP_NAME = 'Miasteczko Poslan';

test.describe('Mapper room persistence', () => {
    test('should center map on room when receiving room.info GMCP', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const locationLabel = page.locator('#location-text');

        // Initially the map starts at room #1
        await expect(locationLabel, 'should show initial room on map load').toContainText('#1');

        // Simulate character moving to Rynek (room #2)
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 2,
            id: 2,
            name: 'Rynek',
            zone: POSLAN_MAP_NAME,
            exits: {west: 1, east: 3},
            map: {
                x: 1,
                y: 0,
                name: POSLAN_MAP_NAME,
            },
        });

        await expect(locationLabel, 'should update to room #2 after room.info').toContainText('#2');
        await expect(locationLabel, 'should show Rynek room name').toContainText('Rynek');
        await expect(locationLabel, 'should show area name').toContainText(POSLAN_MAP_NAME);
    });

    test('should persist room position across page reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const locationLabel = page.locator('#location-text');

        // Move to Kamienny Most (room #3)
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 3,
            id: 3,
            name: 'Kamienny Most',
            zone: POSLAN_MAP_NAME,
            exits: {west: 2, north: 4, south: 6},
            map: {
                x: 2,
                y: 0,
                name: POSLAN_MAP_NAME,
            },
        });

        await expect(locationLabel, 'should show room #3 before reload').toContainText('#3');
        await expect(locationLabel, 'should show Kamienny Most before reload').toContainText('Kamienny Most');

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        // After reload, the map should restore to the last known room (#3)
        // The mapperRoomId is persisted to storage and restored on map init
        await expect(locationLabel, 'should restore room #3 after reload').toContainText('#3');
        await expect(locationLabel, 'should restore Kamienny Most name after reload').toContainText('Kamienny Most');
    });

    test('should update to new room after re-login with char.info GMCP', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const locationLabel = page.locator('#location-text');

        // Move to room #2
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 2,
            id: 2,
            name: 'Rynek',
            zone: POSLAN_MAP_NAME,
            exits: {west: 1, east: 3},
            map: {
                x: 1,
                y: 0,
                name: POSLAN_MAP_NAME,
            },
        });

        await expect(locationLabel, 'should show room #2').toContainText('#2');

        // Reload and re-login
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        // The map should restore to room #2 from persisted state
        await expect(locationLabel, 'should restore to room #2 after reload').toContainText('#2');

        // Now send char.info which triggers reading saved mapperRoomId
        await pushGmcp(page, 'char.info', {name: 'MapTester', object_num: 70001});
        await page.waitForTimeout(200);

        // Room should still be #2 from saved state
        await expect(locationLabel, 'should maintain room #2 after char.info').toContainText('#2');

        // Send a new room.info to move to room #3
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 3,
            id: 3,
            name: 'Kamienny Most',
            zone: POSLAN_MAP_NAME,
            exits: {west: 2, north: 4, south: 6},
            map: {
                x: 2,
                y: 0,
                name: POSLAN_MAP_NAME,
            },
        });

        await expect(locationLabel, 'should update to room #3 after new room.info').toContainText('#3');
    });

    test('should persist and restore room across multiple reloads', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const locationLabel = page.locator('#location-text');

        // Move to Rezydencja Borgafa (room #4, at x:2 y:1)
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 4,
            id: 4,
            name: 'Rezydencja Borgafa',
            zone: POSLAN_MAP_NAME,
            exits: {south: 3},
            map: {
                x: 2,
                y: 1,
                name: POSLAN_MAP_NAME,
            },
        });

        await expect(locationLabel, 'should show room #4').toContainText('#4');

        // First reload
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        await expect(locationLabel, 'should show room #4 after first reload').toContainText('#4');

        // Second reload
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        await expect(locationLabel, 'should show room #4 after second reload').toContainText('#4');
    });
});

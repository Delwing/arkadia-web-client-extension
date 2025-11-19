import { expect, test } from './support/fixtures';
import {
    GMCP_PATHS,
    ensureGameSocket,
    pushGmcp,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

const POSLAN_MAP_NAME = 'Miasteczko Poslan';

test.describe('Map location label', () => {
    test('displays current map position and updates after GMCP move', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const locationLabel = page.locator('#location-text');

        await expect(locationLabel, 'should show initial map location from map data').toContainText('#1');
        await expect(locationLabel, 'should display initial map area name').toContainText(POSLAN_MAP_NAME);

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 2,
            id: 2,
            name: 'Rynek',
            zone: POSLAN_MAP_NAME,
            exits: { west: 1, east: 3 },
            map: {
                x: 1,
                y: 0,
                name: POSLAN_MAP_NAME,
            },
        });

        await expect(locationLabel, 'should update map location label after GMCP room change').toContainText('#2');
        await expect(locationLabel, 'should keep map area name after GMCP room change').toContainText(POSLAN_MAP_NAME);

        await submitCommand(page, '/prowadz 3');

        await expect(locationLabel, 'should show destination details when pathfinding is active')
            .toContainText('→ #3 Miasteczko Poslan (1)');
    });
});

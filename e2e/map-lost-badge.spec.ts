import { expect, test } from './support/fixtures';
import {
    GMCP_PATHS,
    ensureGameSocket,
    pushGmcp,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

const POSLAN_MAP_NAME = 'Miasteczko Poslan';

test.describe('Map lost badge', () => {
    test('warns when the game reports a room the map does not know, and clears when it does', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const badge = page.locator('.map-lost-badge');
        await expect(badge, 'should start without a warning').toHaveCount(0);

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 999,
            id: 999,
            name: 'Nieznana polana',
            zone: 'Nieznana kraina',
            exits: {},
            map: {
                x: 500,
                y: 500,
                name: 'Nieznana kraina',
            },
        });

        await expect(badge, 'should warn once the mapper cannot place the room').toBeVisible();
        const box = await badge.boundingBox();
        const mapBox = await page.locator('#map').boundingBox();
        expect(box, 'badge should be rendered').not.toBeNull();
        expect(mapBox, 'map should be rendered').not.toBeNull();
        expect(box!.x + box!.width, 'badge should sit in the map top-right corner')
            .toBeGreaterThan(mapBox!.x + mapBox!.width / 2);
        expect(box!.y, 'badge should sit in the map top-right corner')
            .toBeLessThan(mapBox!.y + mapBox!.height / 2);
        await expect(page.locator('#location-text'), 'should keep the last known room on the map')
            .toContainText('#1');

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

        await expect(badge, 'should clear the warning once the map knows the room again').toHaveCount(0);
        await expect(page.locator('#location-text')).toContainText('#2');
    });
});

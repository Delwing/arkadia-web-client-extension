import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    GMCP_PATHS,
    pushGmcp,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

test.describe('Location restoration', () => {
    test('should restore location correctly after reload', async ({page}) => {
        await page.goto('/?locationId=2');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const locationLabel = page.locator('#location-text');

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 2,
            id: 2,
            name: 'Rynek',
            zone: 'Miasteczko Poslan',
            exits: { west: 1, east: 3 },
            map: {
                x: 1,
                y: 0,
                name: 'Miasteczko Poslan',
            },
        });

        await expect(locationLabel, 'should display restored location from query param').toContainText('#2');
        await expect(locationLabel, 'should show restored location area name').toContainText('Miasteczko Poslan');

        const urlAfterLoad = page.url();
        expect(urlAfterLoad, 'URL should not contain locationId parameter after initial load').not.toContain('locationId');

        await page.reload();

        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 2,
            id: 2,
            name: 'Rynek',
            zone: 'Miasteczko Poslan',
            exits: { west: 1, east: 3 },
            map: {
                x: 1,
                y: 0,
                name: 'Miasteczko Poslan',
            },
        });

        await expect(locationLabel, 'should display restored location after reload').toContainText('#2');
        await expect(locationLabel, 'should keep restored area name after reload').toContainText('Miasteczko Poslan');
    });

    test('should receive GMCP room.info event correctly after connection', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const locationLabel = page.locator('#location-text');

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 3,
            id: 3,
            name: 'Kamienny Most',
            zone: 'Miasteczko Poslan',
            exits: { west: 2, north: 4, south: 6 },
            map: {
                x: 2,
                y: 0,
                name: 'Miasteczko Poslan',
            },
        });

        await expect(locationLabel, 'should display location after receiving first room.info').toContainText('#3');
        await expect(locationLabel, 'should include area name for first room.info location').toContainText('Miasteczko Poslan');

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 4,
            id: 4,
            name: 'Rezydencja Borgafa',
            zone: 'Miasteczko Poslan',
            exits: { south: 3 },
            map: {
                x: 2,
                y: 1,
                name: 'Miasteczko Poslan',
            },
        });

        await expect(locationLabel, 'should ignore second room.info without refresh trigger').toContainText('#3');
        await expect(locationLabel, 'should keep original area name when second event is ignored').toContainText('Miasteczko Poslan');
    });
});

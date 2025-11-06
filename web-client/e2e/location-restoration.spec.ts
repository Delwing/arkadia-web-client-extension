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
        await expect(locationLabel, 'should include name of first room.info location').toContainText('Kamienny Most');

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 4,
            id: 4,
            name: 'Rezydencja Borgafa',
            zone: 'Miasteczko Poslan',
            exits: { south: 3 },
            map: {
                x: 2,
                y: -1,
                name: 'Miasteczko Poslan',
            },
        });

        await expect(locationLabel, 'should update location label after second room.info').toContainText('#4');
        await expect(locationLabel, 'should include name of second room.info location').toContainText('Rezydencja Borgafa');
    });

    test('should receive GMCP room.info events for different areas', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        const locationLabel = page.locator('#location-text');

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6,
            id: 6,
            name: 'Wejscie do Jaskin',
            zone: 'Zapomniane Jaskinie',
            exits: { north: 3, east: 7 },
            map: {
                x: 0,
                y: 1,
                name: 'Zapomniane Jaskinie',
            },
        });

        await expect(locationLabel, 'should show cave location in label').toContainText('#6');
        await expect(locationLabel, 'should mention cave area name in label').toContainText('Zapomniane Jaskinie');

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 1,
            id: 1,
            name: 'Poczta',
            zone: 'Miasteczko Poslan',
            exits: { east: 2 },
            map: {
                x: 0,
                y: 0,
                name: 'Miasteczko Poslan',
            },
        });

        await expect(locationLabel, 'should update label when returning to town').toContainText('#1');
        await expect(locationLabel, 'should show town area name after returning from caves').toContainText('Miasteczko Poslan');
    });
});

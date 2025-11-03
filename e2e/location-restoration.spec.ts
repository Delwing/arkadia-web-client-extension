import { expect, test } from './support/fixtures';
import { ensureGameSocket, GMCP_PATHS, pushGmcp, waitForClientReady, waitForMapReady } from './support/mocks';

test.describe('Location restoration', () => {
    test('should restore location correctly after reload', async ({ page }) => {
        // Start with a location ID in the URL
        await page.goto('/?locationId=2');
        await waitForClientReady(page);
        await waitForMapReady(page);
        await ensureGameSocket(page);

        // Send GMCP room.info to trigger location setting (with map hash data)
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 2,
            id: 2,
            name: 'Rynek',
            zone: 'Miasteczko Poslan',
            exits: { west: 1, east: 3 },
            map: {
                x: 1,
                y: 0,
                name: 'Miasteczko Poslan'
            }
        });

        // Wait for the map to process the location
        await page.waitForFunction(() => {
            const client: any = (globalThis as any).clientExtension;
            return client?.Map?.currentRoom?.id === 2;
        }, { timeout: 5000 });

        // Verify the location is set correctly by hash
        const currentLocation = await page.evaluate(() => {
            const client: any = (globalThis as any).clientExtension;
            return {
                id: client?.Map?.currentRoom?.id,
                hash: client?.Map?.currentRoom?.hash,
                x: client?.Map?.currentRoom?.x,
                y: client?.Map?.currentRoom?.y,
                area: client?.Map?.currentRoom?.area
            };
        });
        expect(currentLocation.id, 'current location id should be 2').toBe(2);
        expect(currentLocation.hash, 'location should be found by hash').toBe('1:0:0:Miasteczko Poslan');
        expect(currentLocation.x, 'x coordinate should match').toBe(1);
        // y can be 0 or -0, both are valid
        expect(Math.abs(currentLocation.y), 'y coordinate absolute value should be 0').toBe(0);

        // Verify the locationId parameter was removed from URL
        const urlAfterLoad = page.url();
        expect(urlAfterLoad, 'URL should not contain locationId parameter after initial load').not.toContain('locationId');

        // Reload the page without locationId parameter
        await page.reload();
        await waitForClientReady(page);
        await waitForMapReady(page);
        await ensureGameSocket(page);

        // Send GMCP room.info again
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 2,
            id: 2,
            name: 'Rynek',
            zone: 'Miasteczko Poslan',
            exits: { west: 1, east: 3 },
            map: {
                x: 1,
                y: 0,
                name: 'Miasteczko Poslan'
            }
        });

        // Wait for the map to process the location
        await page.waitForFunction(() => {
            const client: any = (globalThis as any).clientExtension;
            return client?.Map?.currentRoom?.id === 2;
        }, { timeout: 5000 });

        // Verify the location is still set correctly after reload using hash
        const currentLocationAfterReload = await page.evaluate(() => {
            const client: any = (globalThis as any).clientExtension;
            return {
                id: client?.Map?.currentRoom?.id,
                hash: client?.Map?.currentRoom?.hash,
                x: client?.Map?.currentRoom?.x,
                y: client?.Map?.currentRoom?.y
            };
        });
        expect(currentLocationAfterReload.id, 'current location id should still be 2 after reload').toBe(2);
        expect(currentLocationAfterReload.hash, 'location hash should still be correct after reload').toBe('1:0:0:Miasteczko Poslan');
        expect(currentLocationAfterReload.x, 'x coordinate should still match after reload').toBe(1);
        // y can be 0 or -0, both are valid
        expect(Math.abs(currentLocationAfterReload.y), 'y coordinate absolute value should be 0 after reload').toBe(0);
    });

    test('should receive GMCP room.info event correctly after connection', async ({ page }) => {
        await page.goto('/');
        await waitForClientReady(page);
        await waitForMapReady(page);
        await ensureGameSocket(page);

        // Verify map is initialized with default location from map data
        const initialLocation = await page.evaluate(() => {
            const client: any = (globalThis as any).clientExtension;
            return client?.Map?.currentRoom?.id;
        });
        expect(initialLocation, 'initial location should be set from map data').toBeTruthy();

        // Set up event listener
        await page.evaluate(() => {
            (globalThis as any).__roomInfoReceived1 = false;
            const client: any = (globalThis as any).clientExtension;
            const unsubscribe = client.on('gmcp.room.info', (detail: any) => {
                if (detail?.id === 3 && detail?.name === 'Kamienny Most') {
                    (globalThis as any).__roomInfoReceived1 = true;
                    unsubscribe?.();
                }
            });
        });

        // Send GMCP room.info event
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 3,
            id: 3,
            name: 'Kamienny Most',
            zone: 'Miasteczko Poslan',
            exits: { west: 2, north: 4, south: 6 },
            map: {
                x: 2,
                y: 0,
                name: 'Miasteczko Poslan'
            }
        });

        // Wait for event to be received
        await page.waitForFunction(() => {
            return (globalThis as any).__roomInfoReceived1 === true;
        }, { timeout: 5000 });

        // Verify the GMCP event was received
        const roomInfoReceived1 = await page.evaluate(() => (globalThis as any).__roomInfoReceived1);
        expect(roomInfoReceived1, 'room.info event should be received').toBe(true);

        // Set up event listener for second event
        await page.evaluate(() => {
            (globalThis as any).__roomInfoReceived2 = false;
            const client: any = (globalThis as any).clientExtension;
            const unsubscribe = client.on('gmcp.room.info', (detail: any) => {
                if (detail?.id === 4 && detail?.name === 'Rezydencja Borgafa') {
                    (globalThis as any).__roomInfoReceived2 = true;
                    unsubscribe?.();
                }
            });
        });

        // Send another GMCP room.info event
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 4,
            id: 4,
            name: 'Rezydencja Borgafa',
            zone: 'Miasteczko Poslan',
            exits: { south: 3 },
            map: {
                x: 2,
                y: -1,
                name: 'Miasteczko Poslan'
            }
        });

        // Wait for event to be received
        await page.waitForFunction(() => {
            return (globalThis as any).__roomInfoReceived2 === true;
        }, { timeout: 5000 });

        // Verify the second GMCP event was received
        const roomInfoReceived2 = await page.evaluate(() => (globalThis as any).__roomInfoReceived2);
        expect(roomInfoReceived2, 'second room.info event should be received').toBe(true);
    });

    test('should receive GMCP room.info events for different areas', async ({ page }) => {
        await page.goto('/');
        await waitForClientReady(page);
        await waitForMapReady(page);
        await ensureGameSocket(page);

        // Set up event listener for cave location
        await page.evaluate(() => {
            (globalThis as any).__caveLocationReceived = false;
            (globalThis as any).__caveExits = [];
            const client: any = (globalThis as any).clientExtension;
            const unsubscribe = client.on('gmcp.room.info', (detail: any) => {
                if (detail?.id === 6 && detail?.zone === 'Zapomniane Jaskinie') {
                    (globalThis as any).__caveLocationReceived = true;
                    (globalThis as any).__caveExits = detail?.exits ? Object.keys(detail.exits) : [];
                    unsubscribe?.();
                }
            });
        });

        // Test room.info for a location in a different area
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6,
            id: 6,
            name: 'Wejscie do Jaskin',
            zone: 'Zapomniane Jaskinie',
            exits: { north: 3, east: 7 },
            map: {
                x: 0,
                y: 1,
                name: 'Zapomniane Jaskinie'
            }
        });

        // Wait for event to be received
        await page.waitForFunction(() => {
            return (globalThis as any).__caveLocationReceived === true;
        }, { timeout: 5000 });

        // Verify the cave location event was received
        const caveLocationReceived = await page.evaluate(() => (globalThis as any).__caveLocationReceived);
        const caveExits = await page.evaluate(() => (globalThis as any).__caveExits);
        expect(caveLocationReceived, 'room.info event for caves should be received').toBe(true);
        expect(caveExits, 'exits should be included in room.info').toContain('north');
        expect(caveExits, 'exits should be included in room.info').toContain('east');

        // Set up event listener for town location
        await page.evaluate(() => {
            (globalThis as any).__townLocationReceived = false;
            (globalThis as any).__townExits = [];
            const client: any = (globalThis as any).clientExtension;
            const unsubscribe = client.on('gmcp.room.info', (detail: any) => {
                if (detail?.id === 1 && detail?.zone === 'Miasteczko Poslan') {
                    (globalThis as any).__townLocationReceived = true;
                    (globalThis as any).__townExits = detail?.exits ? Object.keys(detail.exits) : [];
                    unsubscribe?.();
                }
            });
        });

        // Move to a location in the town area
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 1,
            id: 1,
            name: 'Poczta',
            zone: 'Miasteczko Poslan',
            exits: { east: 2 },
            map: {
                x: 0,
                y: 0,
                name: 'Miasteczko Poslan'
            }
        });

        // Wait for event to be received
        await page.waitForFunction(() => {
            return (globalThis as any).__townLocationReceived === true;
        }, { timeout: 5000 });

        // Verify the town location event was received
        const townLocationReceived = await page.evaluate(() => (globalThis as any).__townLocationReceived);
        const townExits = await page.evaluate(() => (globalThis as any).__townExits);
        expect(townLocationReceived, 'room.info event for town should be received').toBe(true);
        expect(townExits, 'exits should be included in room.info').toContain('east');
    });
});

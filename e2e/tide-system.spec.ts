import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    GMCP_PATHS,
    mockMapDownloads,
    pushGmcp,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import type { Page } from '@playwright/test';
import mapData from './support/mock-data/map-data.json' with { type: 'json' };

// `/przyplyw` floods the tide rooms: each one drops to z=-1 and a surface copy
// (id + 100000) takes over its GMCP position, linked to the other surface rooms.
// The ids below are real tide rooms (tideSystem.ts), laid out as a small coast
// added to the mock map, with 3287 as the shore room the tide transfers exits to.
const AREA_NAME = 'Wybrzeze';
const AREA_ID = 50;
const SURFACE = 100000;

const COAST = { x: 0, y: 0, id: 3287 };
const TIDE = {
    entry: { x: 1, y: 0, id: 18975 },
    rock: { x: 2, y: 0, id: 18976 },
    shoal: { x: 2, y: 1, id: 18980 },
    reef: { x: 3, y: 1, id: 18977 },
};

function room(id: number, x: number, y: number, name: string, exits: Record<string, number>) {
    return {
        area: AREA_ID, x, y, z: 0, weight: 1, name,
        rawSpecialExits: {}, symbol: '', userData: {}, customLines: {}, stubs: [], doors: {},
        id, env: 1, exits, specialExits: {},
        hash: `${x}:${y}:0:${AREA_NAME}`,
    };
}

function tideMap() {
    const data = structuredClone(mapData) as unknown[];
    data.push({
        areaName: AREA_NAME,
        areaId: String(AREA_ID),
        labels: [],
        rooms: [
            room(COAST.id, COAST.x, COAST.y, 'Plaza', { east: TIDE.entry.id }),
            room(TIDE.entry.id, TIDE.entry.x, TIDE.entry.y, 'Piaszczysta lacha', { west: COAST.id, east: TIDE.rock.id }),
            room(TIDE.rock.id, TIDE.rock.x, TIDE.rock.y, 'Skala', { west: TIDE.entry.id, south: TIDE.shoal.id }),
            room(TIDE.shoal.id, TIDE.shoal.x, TIDE.shoal.y, 'Mielizna', { north: TIDE.rock.id, east: TIDE.reef.id }),
            room(TIDE.reef.id, TIDE.reef.x, TIDE.reef.y, 'Rafa', { west: TIDE.shoal.id }),
        ],
    });
    return data;
}

/** The game says we stand at these coordinates; the map decides which room that is. */
async function standAt(page: Page, spot: { x: number; y: number; id: number }) {
    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
        num: spot.id,
        id: spot.id,
        name: 'Wybrzeze',
        zone: AREA_NAME,
        exits: {},
        map: { x: spot.x, y: spot.y, name: AREA_NAME },
    });
}

const output = (page: Page) => page.locator('#main_text_output_msg_wrapper');
const location = (page: Page) => page.locator('#location-text');

test.describe('Tide (/przyplyw)', () => {
    test.beforeEach(async ({ page, context }) => {
        await mockMapDownloads(context, { mapData: tideMap() as never });
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);
    });

    test('high tide puts a surface room above each tide room, low tide takes it away', async ({ page }) => {
        await standAt(page, TIDE.rock);
        await expect(location(page)).toContainText(`#${TIDE.rock.id} `);

        await submitCommand(page, '/przyplyw');
        await expect(output(page)).toContainText('Przyplyw wlaczony.');

        // The rock is under water now; the surface copy is straight up, and the
        // surface has a direct rock -> reef link the sea bed does not.
        await submitCommand(page, 'u');
        await expect(location(page)).toContainText(`#${TIDE.rock.id + SURFACE} `);
        await submitCommand(page, 'se');
        await expect(location(page)).toContainText(`#${TIDE.reef.id + SURFACE} `);

        // Low tide removes the surface rooms; the marker drops onto the room below.
        await submitCommand(page, '/przyplyw');
        await expect(output(page)).toContainText('Przyplyw wylaczony.');
        await expect(location(page)).toContainText(`#${TIDE.reef.id} `);
    });

    test('/prowadz takes the surface shortcut only at high tide', async ({ page }) => {
        // Low tide: rock -> reef goes round through the shoal.
        await standAt(page, TIDE.rock);
        await expect(location(page)).toContainText(`#${TIDE.rock.id} `);
        await submitCommand(page, `/prowadz ${TIDE.reef.id}`);
        await expect(location(page)).toContainText(`→ #${TIDE.reef.id} ${AREA_NAME} (2)`);

        await submitCommand(page, '/przyplyw');
        await expect(output(page)).toContainText('Przyplyw wlaczony.');

        // High tide: one step along the surface. The route only finds it if the
        // pathfinder was rebuilt after the tide added the surface rooms.
        await submitCommand(page, 'u');
        await expect(location(page)).toContainText(`#${TIDE.rock.id + SURFACE} `);
        await submitCommand(page, `/prowadz ${TIDE.reef.id + SURFACE}`);
        await expect(location(page)).toContainText(`→ #${TIDE.reef.id + SURFACE} ${AREA_NAME} (1)`);
    });
});

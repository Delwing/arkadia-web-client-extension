import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    GMCP_PATHS,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import type { Page } from '@playwright/test';

// The Rinde labyrinth has no fixed map: `/labirynt_mapa` draws one as you walk.
// Each room the game describes (room.info without map coordinates, then its
// description and exit line) becomes a temporary map room from id 200000 up,
// linked to the room you came from.
const FIRST = 200000;
const SECOND = 200001;
const AREA_NAME = 'Labirynt (mapper)';

const CORRIDOR = 'Waski korytarz ciagnie sie miedzy wilgotnymi scianami.';
const CHAMBER = 'Niska komnata o sklepieniu porosnietym mchem.';

/** The game moves us into a labyrinth room and describes it. */
async function enterRoom(page: Page, description: string, exits: string) {
    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, { num: 0, name: 'Labirynt', exits: {} });
    await pushText(page, description);
    await pushText(page, exits);
}

const output = (page: Page) => page.locator('#main_text_output_msg_wrapper');
const location = (page: Page) => page.locator('#location-text');

test.describe('Rinde labyrinth mapper (/labirynt_mapa)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);
    });

    test('maps the rooms you walk through and links them', async ({ page }) => {
        await submitCommand(page, '/labirynt_mapa');
        await expect(output(page)).toContainText('[Labirynt] Mapper wlaczony.');

        await enterRoom(page, CORRIDOR, 'Sa tutaj dwa widoczne wyjscia: polnoc i poludnie.');
        await expect(output(page)).toContainText('[Labirynt] Pokoj 1/1 | polnoc, poludnie');
        await expect(location(page)).toContainText(`#${FIRST} `);

        await submitCommand(page, 'polnoc');
        await enterRoom(page, CHAMBER, 'Jest tutaj jedno widoczne wyjscie: poludnie.');
        await expect(output(page)).toContainText('[Labirynt] Pokoj 2/2 | poludnie');
        await expect(location(page)).toContainText(`#${SECOND} `);

        // Walking back recognises the first room by its description.
        await submitCommand(page, 'poludnie');
        await enterRoom(page, CORRIDOR, 'Sa tutaj dwa widoczne wyjscia: polnoc i poludnie.');
        await expect(output(page)).toContainText('[Labirynt] Pokoj 1/2 | polnoc [2], poludnie');
        await expect(location(page)).toContainText(`#${FIRST} `);

        await submitCommand(page, '/labirynt_mapa');
        await expect(output(page)).toContainText('[Labirynt] Mapper wylaczony.');
    });

    test('/prowadz can lead through the mapped rooms', async ({ page }) => {
        await submitCommand(page, '/labirynt_mapa');
        await expect(output(page)).toContainText('[Labirynt] Mapper wlaczony.');

        await enterRoom(page, CORRIDOR, 'Sa tutaj dwa widoczne wyjscia: polnoc i poludnie.');
        await expect(output(page)).toContainText('[Labirynt] Pokoj 1/1');
        await submitCommand(page, 'polnoc');
        await enterRoom(page, CHAMBER, 'Jest tutaj jedno widoczne wyjscie: poludnie.');
        await expect(output(page)).toContainText('[Labirynt] Pokoj 2/2');
        await submitCommand(page, 'poludnie');
        await enterRoom(page, CORRIDOR, 'Sa tutaj dwa widoczne wyjscia: polnoc i poludnie.');
        await expect(output(page)).toContainText('[Labirynt] Pokoj 1/2 | polnoc [2]');
        await expect(location(page)).toContainText(`#${FIRST} `);

        // The route exists only if the pathfinder was rebuilt as the rooms were added.
        await submitCommand(page, `/prowadz ${SECOND}`);
        await expect(location(page)).toContainText(`→ #${SECOND} ${AREA_NAME} (1)`);
    });
});

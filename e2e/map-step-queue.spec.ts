import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import {
    GMCP_PATHS,
    ensureGameSocket,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import { openSettings, saveSettings } from './support/settings';

const POSLAN = 'Miasteczko Poslan';

const roomInfo = (id: number, x: number, y: number, zone = POSLAN) => ({
    num: id,
    id,
    name: `Pokoj ${id}`,
    zone,
    exits: {},
    map: { x, y, name: zone },
});

/** Turns the step queue's correction on in Ustawienia → Eksperymentalne, then stands in `room`. */
async function startWithCorrection(page: Page, room: { id: number; x: number; y: number }) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await waitForMapReady(page);

    const settings = await openSettings(page, 'ui-experimental');
    await settings.locator('#ui-map-step-queue-correction').check();
    await saveSettings(page);

    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, roomInfo(room.id, room.x, room.y));
    await expect(page.locator('#location-text')).toContainText(`#${room.id}`);
}

test.describe('Map step queue correction (Eksperymentalne)', () => {
    test('a blocker the map missed in the middle of a burst puts the map back where the game is', async ({ page }) => {
        await startWithCorrection(page, { id: 1, x: 0, y: 0 });

        // The map walks e, e, n at once: Poczta (1) -> Rynek (2) -> Kamienny Most (3) -> Rezydencja (4).
        await submitCommand(page, 'e;e;n');
        await expect(page.locator('#location-text')).toContainText('#4');

        // The game takes the first e and blocks the second; the map's own check already let go.
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, roomInfo(2, 1, 0));
        await pushText(page, 'Ogromne stwory przysiadaja przed brama, blokujac do niej dostepu.');
        await expect(page.locator('#location-text'), 'the queue puts the map back on Rynek').toContainText('#2');

        // The n is still on its way: Rynek has no way north, so the game refuses it and the map stays.
        await pushText(page, 'Nie widzisz zadnego wyjscia prowadzacego na polnoc.');
        await submitCommand(page, 'zerknij');
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, roomInfo(2, 1, 0));
        await expect(page.locator('#location-text')).toContainText('#2');
    });

    test('GMCP coordinates past a step refused by an unknown line put the map where the game is', async ({ page }) => {
        await startWithCorrection(page, { id: 3, x: 2, y: 0 });

        // From Kamienny Most (3): north to Rezydencja (4), then south - which the map takes from 4, back to 3.
        await submitCommand(page, 'n;s');
        await expect(page.locator('#location-text')).toContainText('#3');

        // The game refuses north with a line nothing knows, then takes south from 3: into the caves (6).
        await pushText(page, 'Cos dziwnego nie pozwala ci tam pojsc.');
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, roomInfo(6, 0, 1, 'Zapomniane Jaskinie'));
        await expect(page.locator('#location-text')).toContainText('#6');
    });

    test('a lone step answered with "Nie ma takiej komendy" puts the map back', async ({ page }) => {
        await startWithCorrection(page, { id: 1, x: 0, y: 0 });

        await submitCommand(page, 'e');
        await expect(page.locator('#location-text')).toContainText('#2');
        // Nothing else went out since the step, so the line is its refusal.
        await pushText(page, "Nie ma takiej komendy. Wpisz '?' aby uzyskac pomoc.");
        await expect(page.locator('#location-text')).toContainText('#1');
    });

    test('a typo answered with "Nie ma takiej komendy" does not undo a waiting step', async ({ page }) => {
        await startWithCorrection(page, { id: 1, x: 0, y: 0 });

        await submitCommand(page, 'e');
        await expect(page.locator('#location-text')).toContainText('#2');
        await submitCommand(page, 'pomachaj');
        // Taken as the step's refusal, this would send the map back to Poczta (1).
        await pushText(page, "Nie ma takiej komendy. Wpisz '?' aby uzyskac pomoc.");
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, roomInfo(2, 1, 0));
        await expect(page.locator('#location-text')).toContainText('#2');
    });
});

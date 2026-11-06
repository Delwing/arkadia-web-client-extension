import { expect, test } from './support/fixtures';
import {
    GMCP_PATHS,
    ensureGameSocket,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
    waitForOutputContaining,
} from './support/mocks';

const POSLAN = 'Miasteczko Poslan';

const roomInfo = (id: number, x: number, y: number, zone = POSLAN) => ({
    num: id,
    id,
    name: `Pokoj ${id}`,
    zone,
    exits: {},
    map: { x, y, name: zone },
});

test.describe('Map step shadow (/mapkolejka)', () => {
    test('a blocker in the middle of a burst shows where the queue and the map part ways', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, roomInfo(1, 0, 0));
        await expect(page.locator('#location-text')).toContainText('#1');

        await submitCommand(page, '/mapkolejka');
        await waitForOutputContaining(page, 'Kolejka krokow mapy: wlaczona (tylko problemy).');

        // Poczta (1) -e-> Rynek (2) -e-> Kamienny Most (3) -n-> Rezydencja (4): the map walks all three at once.
        await submitCommand(page, 'e;e;n');
        await expect(page.locator('#location-text')).toContainText('#4');

        // The game takes the first step, blocks the second, and the third has no way north from Rynek.
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, roomInfo(2, 1, 0));
        await pushText(page, 'Ogromne stwory przysiadaja przed brama, blokujac do niej dostepu.');
        await waitForOutputContaining(page, '[kolejka] odrzucony e [blokada]');
        await pushText(page, 'Nie widzisz zadnego wyjscia prowadzacego na polnoc.');
        await waitForOutputContaining(page, 'odrzucony n [brak wyjscia] | kolejka: #2 Rynek | mapa: #4');

        // The shadow only watches: the map is still where it walked to.
        await expect(page.locator('#location-text')).toContainText('#4');

        await submitCommand(page, '/mapkolejka stan');
        await waitForOutputContaining(page, 'Kolejka: potwierdzone #2 Rynek, czeka: nic, wychodzi #2 Rynek, mapa #4');
    });

    test('GMCP coordinates line the queue up past a step refused by an unknown line', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, roomInfo(3, 2, 0));
        await expect(page.locator('#location-text')).toContainText('#3');

        await submitCommand(page, '/mapkolejka');
        await waitForOutputContaining(page, 'Kolejka krokow mapy: wlaczona (tylko problemy).');

        // From Kamienny Most (3): north to Rezydencja (4), then south - which the map takes from 4, back to 3.
        await submitCommand(page, 'n;s');
        await expect(page.locator('#location-text')).toContainText('#3');

        // The game refuses north with a line nothing knows, then takes south from 3: into the caves (6).
        await pushText(page, 'Cos dziwnego nie pozwala ci tam pojsc.');
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, roomInfo(6, 0, 1, 'Zapomniane Jaskinie'));
        await waitForOutputContaining(page, 'potwierdzony s');
        await waitForOutputContaining(page, 'POMINIETE: n');

        await submitCommand(page, '/mapkolejka stan');
        await waitForOutputContaining(page, 'Kolejka: potwierdzone #6 Wejscie do Jaskin, czeka: nic');
    });
});

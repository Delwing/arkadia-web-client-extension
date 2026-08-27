import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    GMCP_PATHS,
    primeCharInfo,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

const BOARD_TEXT = [
    'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:',
    ' o============================================================================o',
    ' |                Adresat badz                     Cena          Czas na      |',
    ' |               urzad pocztowy                  zl/sr/md      dostarczenie   |',
    ' o -------------------------------------------------------------------------- o',
    ' |   1. Borgaf Kriegmann                          0/ 4/ 2        nieogr.      |',
    " | * 2. Georg Blaskovitz                        0/ 5/ 0        8 godzin     |",
    ' o -------------------------------------------------------------------------- o',
    ' |      Symbolem * oznaczono przesylki ciezkie.                               |',
    ' o============================================================================o',
].join('\n');

test('Package helper highlights NPCs and guides selected deliveries', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    await waitForMapReady(page);

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

    const locationLabel = page.locator('#location-text');
    await expect(locationLabel, 'should render current map location before selecting delivery').toContainText('#1');

    await pushText(page, BOARD_TEXT);

    const boardMessage = page
        .locator('#main_text_output_msg_wrapper .output_msg')
        .filter({hasText: 'Borgaf Kriegmann'})
        .last();

    await expect(boardMessage, 'should display delivery board header').toContainText(
        'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:'
    );
    await expect(boardMessage, 'should indicate known NPC delivery distance').toContainText('dystans: 3');
    await expect(boardMessage, 'should indicate unknown NPC delivery distance as unavailable').toContainText('dystans: --');

    const knownNpc = boardMessage.locator('span[data-output-clickable="true"]', {hasText: 'Borgaf Kriegmann'});
    const unknownNpc = boardMessage.locator('span[data-output-clickable="true"]', {hasText: 'Georg Blaskovitz'});

    await expect(knownNpc, 'should highlight known NPC name in green').toHaveCSS('color', 'rgb(99, 186, 65)');
    await expect(unknownNpc, 'should gray out unknown NPC name').toHaveCSS('color', 'rgb(170, 170, 170)');

    await knownNpc.click();

    await expect
        .poll(async () => {
            return await getLastOutgoingCommand(page);
        }, {message: 'should send command selecting known NPC package'})
        .toBe('wybierz paczke 1');

    await expect
        .poll(async () => {
            return await page.evaluate(() => document.activeElement?.id ?? '');
        }, {message: 'should restore command input focus after clicking an output link'})
        .toBe('message-input');

    await pushText(page, 'Uprzejmy urzednik przekazuje ci jakas paczke.');

    await expect(locationLabel, 'should mark delivery destination on map label').toContainText('→ #4');
    await expect(locationLabel, 'should indicate distance to delivery destination').toContainText('(3)');

    const status = page.locator('#package-status');
    await expect(status, 'should reveal package status after collection').toBeVisible();
    await expect(status, 'should show selected NPC in package status').toHaveText('📦: Borgaf Kriegmann');
});

test('Package helper respects disabled setting and avoids assisting deliveries', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    await waitForMapReady(page);

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

    const optionsModal = page.locator('#options-modal');
    await page.click('#menu-button');
    await page.click('#options-button');
    await expect(optionsModal, 'should open options modal').toBeVisible();

    const packageHelperToggle = optionsModal.locator('#packageHelper');
    await expect(packageHelperToggle, 'should enable package helper by default').toBeChecked();
    await packageHelperToggle.uncheck();

    await optionsModal.locator('#options-save').click();
    await expect(optionsModal, 'should close options modal after saving').not.toBeVisible();

    await pushText(page, BOARD_TEXT);

    const boardMessage = page
        .locator('#main_text_output_msg_wrapper .output_msg')
        .filter({hasText: 'Borgaf Kriegmann'})
        .last();

    await expect(boardMessage, 'should still display delivery board text').toContainText(
        'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:'
    );
    await expect(boardMessage, 'should not display distance annotations when helper disabled').not.toContainText('dystans:');
    await expect(
        boardMessage.locator('span[data-output-clickable="true"]'),
        'should keep delivery NPCs non-clickable when helper disabled'
    ).toHaveCount(0);

    await submitCommand(page, 'wybierz paczke 1');

    await pushText(page, 'Uprzejmy urzednik przekazuje ci jakas paczke.');

    await expect
        .poll(async () => {
            return await page.evaluate(() => {
                const element = document.getElementById('package-status');
                if (!element) {
                    return false;
                }
                const style = window.getComputedStyle(element);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return false;
                }
                return Boolean(element.textContent?.trim());
            });
        }, {message: 'should hide package status when helper disabled'})
        .toBe(false);

    const locationLabel = page.locator('#location-text');
    await expect(locationLabel, 'should not set navigation target when helper disabled').not.toContainText('→');
});

test('Package helper works after being disabled and re-enabled', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    await waitForMapReady(page);

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

    // Disable package helper
    const optionsModal = page.locator('#options-modal');
    await page.click('#menu-button');
    await page.click('#options-button');
    await expect(optionsModal, 'should open options modal').toBeVisible();

    const packageHelperToggle = optionsModal.locator('#packageHelper');
    await expect(packageHelperToggle, 'should be enabled by default').toBeChecked();
    await packageHelperToggle.uncheck();
    await optionsModal.locator('#options-save').click();
    await expect(optionsModal, 'should close modal after disabling').not.toBeVisible();

    // Verify disabled — push board text, no annotations
    await pushText(page, BOARD_TEXT);

    const disabledBoard = page
        .locator('#main_text_output_msg_wrapper .output_msg')
        .filter({hasText: 'Borgaf Kriegmann'})
        .last();

    await expect(disabledBoard, 'should not show distance annotations when disabled').not.toContainText('dystans:');

    // Re-enable package helper
    await page.click('#menu-button');
    await page.click('#options-button');
    await expect(optionsModal, 'should reopen options modal').toBeVisible();

    await expect(packageHelperToggle, 'should be unchecked after disabling').not.toBeChecked();
    await packageHelperToggle.check();
    await optionsModal.locator('#options-save').click();
    await expect(optionsModal, 'should close modal after re-enabling').not.toBeVisible();

    // Push board text again — should show annotations now
    await pushText(page, BOARD_TEXT);

    const reenabledBoard = page
        .locator('#main_text_output_msg_wrapper .output_msg')
        .filter({hasText: 'Borgaf Kriegmann'})
        .last();

    await expect(reenabledBoard, 'should show distance annotations after re-enable').toContainText('dystans: 3');

    const clickableNpc = reenabledBoard.locator('span[data-output-clickable="true"]', {hasText: 'Borgaf Kriegmann'});
    await expect(clickableNpc, 'should make NPC clickable after re-enable').toHaveCount(1);
});

test('Package helper stays disabled after page reload', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    await waitForMapReady(page);

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

    // Disable package helper
    const optionsModal = page.locator('#options-modal');
    await page.click('#menu-button');
    await page.click('#options-button');
    await expect(optionsModal, 'should open options modal').toBeVisible();

    await optionsModal.locator('#packageHelper').uncheck();
    await optionsModal.locator('#options-save').click();
    await expect(optionsModal, 'should close modal after disabling').not.toBeVisible();

    // Reload the page
    await page.reload();
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    await waitForMapReady(page);

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

    // Push board text — should NOT show annotations since helper is disabled
    await pushText(page, BOARD_TEXT);

    const boardMessage = page
        .locator('#main_text_output_msg_wrapper .output_msg')
        .filter({hasText: 'Borgaf Kriegmann'})
        .last();

    await expect(boardMessage, 'should not show distance annotations after reload while disabled').not.toContainText('dystans:');
    await expect(
        boardMessage.locator('span[data-output-clickable="true"]'),
        'should keep NPCs non-clickable after reload while disabled'
    ).toHaveCount(0);
});

test('Package helper sets delivery bind on arrival and clears status after handing off', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    await waitForMapReady(page);

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

    await pushText(page, BOARD_TEXT);

    const boardMessage = page
        .locator('#main_text_output_msg_wrapper .output_msg')
        .filter({hasText: 'Borgaf Kriegmann'})
        .last();

    const knownNpc = boardMessage.locator('span[data-output-clickable="true"]', {hasText: 'Borgaf Kriegmann'});
    await knownNpc.click();

    await expect
        .poll(async () => {
            return await getLastOutgoingCommand(page);
        }, {message: 'should send command selecting known NPC package'})
        .toBe('wybierz paczke 1');

    await pushText(page, 'Uprzejmy urzednik przekazuje ci jakas paczke.');

    const locationLabel = page.locator('#location-text');
    await expect(locationLabel, 'should set navigation target after receiving package').toContainText('→ #4');

    const pathRooms = [
        {command: 'e', id: 2, name: 'Rynek', exits: {west: 1, east: 3}, map: {x: 1, y: 0}},
        {command: 'e', id: 3, name: 'Kamienny Most', exits: {west: 2, north: 4, south: 6}, map: {x: 2, y: 0}},
        {command: 'n', id: 4, name: 'Rezydencja Borgafa', exits: {south: 3}, map: {x: 2, y: 1}},
    ];

    for (const room of pathRooms) {
        await submitCommand(page, room.command);
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: room.id,
            id: room.id,
            name: room.name,
            zone: 'Miasteczko Poslan',
            exits: room.exits,
            map: {
                ...room.map,
                name: 'Miasteczko Poslan',
            },
        });
    }

    await pushText(page, 'south', {type: 'room.exits'});

    await page.keyboard.press('BracketRight');
    await expect
        .poll(async () => {
            return await getLastOutgoingCommand(page);
        }, {message: 'should activate delivery bind after reaching destination'})
        .toBe('oddaj paczke');

    await pushText(page, 'Oddajesz pocztowa paczke. Dziekuje za dostarczenie przesylki.');

    await expect
        .poll(async () => {
            return await page.evaluate(() => {
                const element = document.getElementById('package-status');
                if (!element) {
                    return '';
                }
                const style = window.getComputedStyle(element);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return '';
                }
                return element.textContent?.trim() ?? '';
            });
        }, {message: 'should clear package status after delivery'})
        .toBe('');

    await expect(locationLabel, 'should remove navigation target after delivery').not.toContainText('→');
});

test('Package helper records new NPC location after delivery when unknown in database', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    await waitForMapReady(page);

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

    await pushText(page, BOARD_TEXT);

    const boardMessage = page
        .locator('#main_text_output_msg_wrapper .output_msg')
        .filter({hasText: 'Georg Blaskovitz'})
        .last();

    const unknownNpc = boardMessage.locator('span[data-output-clickable="true"]', {hasText: 'Georg Blaskovitz'});
    await unknownNpc.click();

    await pushText(page, 'Uprzejmy urzednik przekazuje ci jakas paczke.');

    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
        num: 5,
        id: 5,
        name: 'Opuszczona Altana',
        zone: 'Miasteczko Poslan',
        exits: {},
        map: {
            x: 4,
            y: 4,
            name: 'Miasteczko Poslan',
        },
    });
    await pushGmcp(page, 'gmcp_msg.room.exits', {exits: []});

    await submitCommand(page, 'oddaj paczke');
    await pushText(page, 'Oddajesz pocztowa paczke. Dziekuje za dostarczenie przesylki.');

    const output = page.locator('#main_text_output_msg_wrapper');
    await expect(output, 'should log new NPC addition with target room').toContainText(
        'Nowy adresat: Georg Blaskovitz | 1'
    );
});

import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getRecentOutput,
    GMCP_PATHS,
    pushGmcp,
    pushText,
    resetCommandLog,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';

// Shared setup: navigate to page and log in as LootTester
async function setupLootTester(page: Parameters<typeof waitForCommandInput>[0]) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'LootTester', object_num: 70030});
    await waitForCharacter(page, 'LootTester');
}

// Helper: simulate entering a new room (resets loot state in lootParser).
// roomNum must be a valid room ID in the mock map data (1-5, 100-102, 200-201, etc.)
// so that MapHelper fires the 'enterLocation' event.
async function enterRoom(page: Parameters<typeof pushGmcp>[0], roomNum = 1) {
    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
        num: roomNum,
        id: roomNum,
        name: 'Test Room',
        zone: 'Miasteczko Poslan',
        exits: {},
        map: {x: 0, y: 0, name: 'Miasteczko Poslan'},
    });
    await page.waitForTimeout(200);
}

// Helper: push room contents with bodies/sterty
async function pushRoomContents(page: Parameters<typeof pushText>[0], text: string) {
    await pushText(page, text, {type: 'room.contents.object'});
    await page.waitForTimeout(100);
}

// Helper: simulate full body inspection response for a regular body
async function pushBodyResponse(
    page: Parameters<typeof pushText>[0],
    description: string,
    items: string,
) {
    await pushText(page, `Jest to martwe cialo ${description}.`);
    await pushText(page, `Zauwazasz przy nim ${items}.`);
    await page.waitForTimeout(100);
}

// Helper: simulate remains (sterta/smetne pozostalosci) response
async function pushRemainsResponse(
    page: Parameters<typeof pushText>[0],
    description: string,
    items: string,
) {
    await pushText(page, `Sa to smetne pozostalosci po jakims ${description}.`);
    await pushText(page, `Zauwazasz przy nim ${items}.`);
    await page.waitForTimeout(100);
}

test.describe('Loot popup', () => {
    test('prints "Brak cial do przeszukania." when no bodies are on location', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);

        // No room contents pushed — room is empty
        await submitCommand(page, '/loot');

        await waitForOutputContaining(page, 'Brak cial do przeszukania.');
        const output = await getRecentOutput(page, 5);
        expect(output, 'should print no-bodies message').toContain('Brak cial do przeszukania.');

        // Popup should NOT appear
        const popup = page.locator('.loot-popup');
        await expect(popup, 'popup should not be visible when no bodies').not.toBeVisible();
    });

    test('opens popup with items and sends ob command for a single body', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);
        await pushRoomContents(page, 'Cialo jakiegos trolla');

        await resetCommandLog(page);
        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        // Verify "ob 1. cialo" was sent to the server
        await expect
            .poll(
                async () => getCommandLog(page),
                {message: 'should send ob 1. cialo command', timeout: 3000},
            )
            .toEqual(expect.arrayContaining(['ob 1. cialo']));

        // Simulate server response to ob 1. cialo
        await pushBodyResponse(page, 'jakiegos trolla', 'miecz i tarcze');

        // Popup should appear
        const popup = page.locator('.loot-popup');
        await expect(popup, 'loot popup should become visible').toBeVisible({timeout: 5000});

        // Popup should contain the body description
        const content = popup.locator('.loot-popup__content');
        await expect(content, 'popup should show body description').toContainText('jakiegos trolla');

        // Popup should list both items
        await expect(content, 'popup should show miecz').toContainText('miecz');
        await expect(content, 'popup should show tarcze').toContainText('tarcze');
    });

    test('shows two separate sections for two bodies with different items', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);
        await pushRoomContents(page, 'Cialo jakiegos trolla i cialo jakiegos orka');

        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        // Verify two ob commands were sent
        await expect
            .poll(
                async () => getCommandLog(page),
                {message: 'should send ob commands for both bodies', timeout: 3000},
            )
            .toEqual(expect.arrayContaining(['ob 1. cialo', 'ob 2. cialo']));

        // Simulate server responding to both ob commands
        await pushBodyResponse(page, 'jakiegos trolla', 'miecz');
        await pushBodyResponse(page, 'jakiegos orka', 'tarcze i helm');

        const popup = page.locator('.loot-popup');
        await expect(popup, 'loot popup should become visible').toBeVisible({timeout: 5000});

        // Two body sections (not special) should be present
        const regularSections = popup.locator('.loot-popup__section:not(.loot-popup__section--special)');
        await expect(regularSections, 'should have two body sections').toHaveCount(2);

        // First section: troll
        const firstSection = regularSections.nth(0);
        await expect(firstSection, 'first section should show troll description').toContainText('jakiegos trolla');
        await expect(firstSection, 'first section should list miecz').toContainText('miecz');

        // Second section: orc
        const secondSection = regularSections.nth(1);
        await expect(secondSection, 'second section should show orc description').toContainText('jakiegos orka');
        await expect(secondSection, 'second section should list tarcze').toContainText('tarcze');
        await expect(secondSection, 'second section should list helm').toContainText('helm');
    });

    test('clicking an item sends correct wez command and removes item from popup', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);
        await pushRoomContents(page, 'Cialo jakiegos trolla');

        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        await pushBodyResponse(page, 'jakiegos trolla', 'miecz i tarcze');

        const popup = page.locator('.loot-popup');
        await expect(popup, 'popup should be visible before item click').toBeVisible({timeout: 5000});

        await resetCommandLog(page);

        // Click the miecz item
        const miecz = popup.locator('.loot-popup__item', {hasText: 'miecz'});
        await expect(miecz, 'miecz item button should be visible').toBeVisible();
        await miecz.click();

        // Verify the correct wez command was sent
        await expect
            .poll(
                async () => getCommandLog(page),
                {message: 'should send wez miecz z ciala command', timeout: 3000},
            )
            .toEqual(expect.arrayContaining(['wez miecz z ciala jakiegos trolla']));

        // miecz button should be removed from popup
        await expect(miecz, 'miecz item should be removed from popup after click').not.toBeVisible();

        // tarcze should still be present
        await expect(
            popup.locator('.loot-popup__item', {hasText: 'tarcze'}),
            'tarcze item should remain visible',
        ).toBeVisible();
    });

    test('popup shows empty state after all items are collected via click', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);
        await pushRoomContents(page, 'Cialo jakiegos trolla');

        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        // Only one item on the body
        await pushBodyResponse(page, 'jakiegos trolla', 'miecz');

        const popup = page.locator('.loot-popup');
        await expect(popup, 'popup should be visible before collecting').toBeVisible({timeout: 5000});

        // Click the sole item — the body entry is removed from state
        const miecz = popup.locator('.loot-popup__item', {hasText: 'miecz'});
        await expect(miecz, 'miecz item should be visible').toBeVisible();
        await miecz.click();

        // After removing the last item the body is spliced out, leaving bodies=[] and
        // groundItems=[], so the popup should display the empty-state message.
        const emptyMsg = popup.locator('.loot-popup__empty');
        await expect(emptyMsg, 'popup should show empty message after all items collected').toBeVisible({timeout: 3000});
        await expect(emptyMsg, 'empty message text should be correct').toHaveText('Brak przedmiotow.');
    });

    test('popup clears and closes when entering a new location', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page, 1);
        await pushRoomContents(page, 'Cialo jakiegos trolla');

        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        await pushBodyResponse(page, 'jakiegos trolla', 'miecz');

        const popup = page.locator('.loot-popup');
        await expect(popup, 'popup should be visible before location change').toBeVisible({timeout: 5000});

        // Simulate entering a new location by directly emitting enterLocation via the exposed
        // window.clientExtension — this is the same event lootParser listens to for clearing loot state.
        await page.evaluate(() => {
            (window as any).clientExtension?.sendEvent('enterLocation', {id: 2, room: null, direction: 'east'});
        });
        await page.waitForTimeout(200);

        // Popup should close because loot.cleared event was emitted by lootParser's enterLocation handler
        await expect(popup, 'popup should close on entering new location').not.toBeVisible({timeout: 3000});
    });

    test('uses "z N. sterty" command format for remains (smetne pozostalosci)', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);
        // sterta szczatkow is parsed as remains
        await pushRoomContents(page, 'Sterta szczatkow');

        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        // Simulate server responding with remains description
        await pushRemainsResponse(page, 'trolla', 'miecz');

        const popup = page.locator('.loot-popup');
        await expect(popup, 'popup should be visible for remains').toBeVisible({timeout: 5000});

        await resetCommandLog(page);

        // Click the miecz item — command should reference sterty, not ciala
        const miecz = popup.locator('.loot-popup__item', {hasText: 'miecz'});
        await expect(miecz, 'miecz button should be visible').toBeVisible();
        await miecz.click();

        await expect
            .poll(
                async () => getCommandLog(page),
                {message: 'should send wez z sterty command for remains', timeout: 3000},
            )
            .toEqual(expect.arrayContaining([expect.stringMatching(/^wez miecz z \d+\. sterty$/)]));
    });

    test('room.contents.object parsing counts bodies correctly', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);

        // Push room contents with two bodies and one non-body item
        await pushRoomContents(page, 'Cialo jakiegos trolla i cialo jakiegos orka');

        await resetCommandLog(page);
        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        // Both bodies should trigger ob commands
        await expect
            .poll(
                async () => getCommandLog(page),
                {message: 'should send ob commands for both counted bodies', timeout: 3000},
            )
            .toEqual(expect.arrayContaining(['ob 1. cialo', 'ob 2. cialo']));
    });

    test('special items (magics/keys) appear in separate "Magiki i klucze" section', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);
        await pushRoomContents(page, 'Cialo jakiegos trolla');

        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        // "magiczny miecz" matches the magic pattern in mock data
        await pushBodyResponse(page, 'jakiegos trolla', 'magiczny miecz i tarcze');

        const popup = page.locator('.loot-popup');
        await expect(popup, 'popup should be visible').toBeVisible({timeout: 5000});

        // Special section should appear with the special header
        const specialSection = popup.locator('.loot-popup__section--special');
        await expect(specialSection, 'special section should be visible for magic items').toBeVisible();

        const specialHeader = specialSection.locator('.loot-popup__section-header--special');
        await expect(specialHeader, 'special section header should say Magiki i klucze').toHaveText('Magiki i klucze');

        // Magic item button should be in the special section
        const magicItem = specialSection.locator('.loot-popup__item', {hasText: 'magiczny miecz'});
        await expect(magicItem, 'magic item should appear in special section').toBeVisible();

        // Regular item (tarcze) should appear in the body section, not the special section
        const bodySection = popup.locator('.loot-popup__section:not(.loot-popup__section--special)');
        await expect(
            bodySection.locator('.loot-popup__item', {hasText: 'tarcze'}),
            'regular item should appear in body section',
        ).toBeVisible();
    });

    test('clicking a special item sends correct wez command', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);
        await pushRoomContents(page, 'Cialo jakiegos trolla');

        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        await pushBodyResponse(page, 'jakiegos trolla', 'magiczny miecz');

        const popup = page.locator('.loot-popup');
        await expect(popup, 'popup should be visible').toBeVisible({timeout: 5000});

        await resetCommandLog(page);

        // Click the special item
        const magicItem = popup.locator('.loot-popup__item', {hasText: 'magiczny miecz'});
        await expect(magicItem, 'magic item button should be visible').toBeVisible();
        await magicItem.click();

        await expect
            .poll(
                async () => getCommandLog(page),
                {message: 'should send wez magiczny miecz z ciala command', timeout: 3000},
            )
            .toEqual(expect.arrayContaining(['wez magiczny miecz z ciala jakiegos trolla']));
    });

    test('popup section header shows body description without "Jest to martwe cialo" prefix', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);
        await pushRoomContents(page, 'Cialo jakiegos trolla');

        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        await pushBodyResponse(page, 'jakiegos trolla', 'miecz');

        const popup = page.locator('.loot-popup');
        await expect(popup, 'popup should be visible').toBeVisible({timeout: 5000});

        // The section header should show just the description part, not the full body line
        const sectionHeader = popup.locator('.loot-popup__section-header').first();
        await expect(sectionHeader, 'section header should show only the description').toHaveText('jakiegos trolla');
        await expect(sectionHeader, 'section header should not include Jest to martwe cialo').not.toContainText('Jest to martwe cialo');
    });

    test('multiple bodies from room.contents.object with sterta sends correct ob count', async ({page}) => {
        await setupLootTester(page);
        await enterRoom(page);

        // One body + one sterta = total 2 ob commands
        await pushRoomContents(page, 'Cialo jakiegos trolla i sterta szczatkow');

        await resetCommandLog(page);
        await submitCommand(page, '/loot');
        await page.waitForTimeout(100);

        const commands = await getCommandLog(page);
        // Should have sent ob 1. cialo and ob 2. cialo (bodies + sterty summed)
        expect(commands, 'should send ob commands for both body and sterta').toEqual(
            expect.arrayContaining(['ob 1. cialo', 'ob 2. cialo']),
        );
        // Should not send more than two ob commands
        const obCommands = commands.filter((c) => c.startsWith('ob '));
        expect(obCommands.length, 'should send exactly two ob commands').toBe(2);
    });
});

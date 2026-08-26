import {expect, test} from './support/fixtures';
import {ensureGameSocket, getCommandLog, getLastOutgoingCommand, pushGmcp, pushText, resetCommandLog, waitForCommandInput, waitForMapReady, GMCP_PATHS} from './support/mocks';

test.describe('Multi-functional Bind Categories', () => {

    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('default category bind fires when key is pressed', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger seat prompt (default category)
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('usiadz');
    });

    test('gates category bind fires when triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger gates (gates category)
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('uderz we wrota');
    });

    test('transport category bind fires when triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger dylizans transport via standing pattern (room.contents.object GMCP)
        await pushText(page, 'czarny stojacy dylizans', { type: 'room.contents.object' });
        await expect(output).toContainText('bind');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        // wem/wlm are intercepted by bagManager aliases (containerAction),
        // so only the boarding command reaches the socket.
        await expect.poll(() => getCommandLog(page), {timeout: 3000}).toEqual(
            expect.arrayContaining(['wsiadz do dylizansu'])
        );
    });

    test('last-set category wins when default and gates share the same key', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // First trigger default (seat)
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Then trigger gates — gates was set more recently, so it should win
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        await expect.poll(
            () => getLastOutgoingCommand(page), {timeout: 3000}
        ).toBe('uderz we wrota');
    });

    test('last-set category wins when gates then default are triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // First trigger gates
        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        // Then trigger default (seat) — default was set more recently, so it should win
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        await expect.poll(
            () => getLastOutgoingCommand(page), {timeout: 3000}
        ).toBe('usiadz');
    });

    test('last-set category wins when transport and default are triggered', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger default first
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Then trigger transport via standing pattern — transport should win
        await pushText(page, 'czarny stojacy dylizans', { type: 'room.contents.object' });
        await expect(output).toContainText('bind');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');

        await expect.poll(() => getCommandLog(page), {timeout: 3000}).toEqual(
            expect.arrayContaining(['wsiadz do dylizansu'])
        );
    });

    test('each category shows its own label in bind message', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger default (seat) and gates — both should print bind messages
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        await pushText(page, 'Probujesz otworzyc masywne wrota.');
        await expect(output).toContainText('uderz we wrota');

        // Both bind messages should be visible
        const text = await output.textContent();
        expect(text).toContain('usiadz');
        expect(text).toContain('uderz we wrota');
    });

    test('transport standing_pattern bind does not fire for a ship not docked at the current location', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');
        await waitForMapReady(page);

        // Set location to Ancelmus dock (6429 = Blekitna Wstega), which is NOT a Charonda stop
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6429,
            id: 6429,
            name: 'Przystan na Blekitnej Wstedze',
            zone: 'Blekitna Wstega',
            map: { x: 0, y: 0, name: 'Transport Docks' },
        });

        // Push Charonda's standing_pattern — player is NOT at a Charonda stop, so no bind
        await pushText(page, 'Dwumasztowy nilfgaardzki statek', { type: 'room.contents.object' });

        // Push Ancelmus's standing_pattern — player IS at an Ancelmus stop, so bind fires
        await pushText(page, 'Wielka galera', { type: 'room.contents.object' });
        await expect(output).toContainText('Blekitna Wstega - Kreutzhofen');

        // Charonda's bind must not have been printed
        const text = await output.textContent();
        expect(text).not.toContain('Novigrad - Baccala');
    });

    test('transport bind switches to the driving wording while on a wagon', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');
        await waitForMapReady(page);

        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6429,
            id: 6429,
            name: 'Przystan na Blekitnej Wstedze',
            zone: 'Blekitna Wstega',
            map: { x: 0, y: 0, name: 'Transport Docks' },
        });

        await pushText(page, 'Siadasz na drewnianym wozie.');
        await pushText(page, 'Wielka galera', { type: 'room.contents.object' });
        await expect(output).toContainText('wjedz na statek');

        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');
        await expect.poll(() => getCommandLog(page), {timeout: 3000}).toContain('wjedz na statek');
        expect(await getCommandLog(page)).not.toContain('wsiadz na statek');
    });

    test('transport stop_pattern callout bind does not fire for a ship whose destination does not match the current location', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');
        await waitForMapReady(page);

        // Set location to Ancelmus dock (6429 = Blekitna Wstega) with map so isOutside=true
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6429,
            id: 6429,
            name: 'Przystan na Blekitnej Wstedze',
            zone: 'Blekitna Wstega',
            map: { x: 0, y: 0, name: 'Transport Docks' },
        });

        // Both Kelim (dest=7912) and Charonda (dest=7910) match this announcement via the
        // "Jakis mezczyzna krzyczy na statku" fallback. Neither destination matches 6429,
        // so no bind should fire.
        await pushText(page, 'Jakis mezczyzna krzyczy na statku: Doplynelismy do poludniowego nabrzeza w Novigradzie! Mozna wysiadac!');

        // Ancelmus arrival at Blekitna Wstega (dest=6429): destination matches player's location
        await pushText(page, 'Czarnowlosy barczysty mezczyzna krzyczy: Doplynelismy do przystani na Blekitnej Wstedze! Mozna wysiadac!');
        await expect(output).toContainText('Blekitna Wstega - Kreutzhofen');

        const text = await output.textContent();
        expect(text).not.toContain('Novigrad - Baccala');
        expect(text).not.toContain('Obawa zach.');
    });
});

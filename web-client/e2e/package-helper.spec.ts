import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    pushGmcp,
    pushText,
    submitCommand,
    waitForClientReady,
    waitForMapReady,
    GMCP_PATHS,
} from './support/mocks';

test('Package helper highlights NPCs and guides selected deliveries', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await ensureGameSocket(page);
    await waitForMapReady(page);
    await waitForClientReady(page);

    await page.evaluate(() => {
        const client: any = (window as any).clientExtension;
        client.contentWidth = 140;
        client.Map.renderRoomByIdSilently?.(1);
        (window as any).__leadToEvents = [];
        window.addEventListener('leadTo', (event: any) => {
            (window as any).__leadToEvents.push(event.detail);
        });
    });

    const path = await page.evaluate(() => {
        const client: any = (window as any).clientExtension;
        return client.Map.findPath(1, 4);
    });
    expect(path, 'should calculate path to selected delivery destination').toEqual([1, 2, 3, 4]);

    const boardText = [
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

    await pushText(page, boardText);

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

    await expect(knownNpc, 'should highlight known NPC name in green').toHaveCSS('color', 'rgb(95, 175, 95)');
    await expect(unknownNpc, 'should gray out unknown NPC name').toHaveCSS('color', 'rgb(168, 168, 168)');

    await knownNpc.click();

    await expect
        .poll(async () => {
            return await getLastOutgoingCommand(page);
        }, {message: 'should send command selecting known NPC package'})
        .toBe('wybierz paczke 1');

    await pushText(page, 'Uprzejmy urzednik przekazuje ci jakas paczke.');

    const status = page.locator('#package-status');
    await expect(status, 'should reveal package status after collection').toBeVisible();
    await expect(status, 'should show selected NPC in package status').toHaveText('📦: Borgaf Kriegmann');

    await expect
        .poll(async () => {
            return await page.evaluate(() => {
                const events = (window as any).__leadToEvents ?? [];
                return events.length ? events[events.length - 1] : null;
            });
        }, {message: 'should trigger lead to event for target location'})
        .toBe(4);
});

test('Package helper respects disabled setting and avoids assisting deliveries', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await ensureGameSocket(page);
    await waitForMapReady(page);
    await waitForClientReady(page);

    await page.evaluate(() => {
        const client: any = (window as any).clientExtension;
        client.contentWidth = 140;
        client.Map.renderRoomByIdSilently?.(1);
        (window as any).__leadToEvents = [];
        window.addEventListener('leadTo', (event: any) => {
            (window as any).__leadToEvents.push(event.detail);
        });
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

    const boardText = [
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

    await pushText(page, boardText);

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

    await expect
        .poll(async () => {
            return await page.evaluate(() => (window as any).__leadToEvents?.length ?? 0);
        }, {message: 'should not emit lead to events when helper disabled'})
        .toBe(0);
});

// Ensures the package helper remembers per-character preferences and toggles as characters change.
test('Package helper persists disabled state per character and defaults for new characters', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await ensureGameSocket(page);
    await waitForMapReady(page);
    await waitForClientReady(page);

    await page.evaluate(() => {
        const client: any = (window as any).clientExtension;
        client.contentWidth = 140;
        client.Map.renderRoomByIdSilently?.(1);
        (window as any).__leadToEvents = [];
        window.addEventListener('leadTo', (event: any) => {
            (window as any).__leadToEvents.push(event.detail);
        });
    });

    const boardText = [
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

    const renderBoard = async () => {
        await pushText(page, boardText);
        return page
            .locator('#main_text_output_msg_wrapper .output_msg')
            .filter({hasText: 'Borgaf Kriegmann'})
            .last();
    };

    const optionsModal = page.locator('#options-modal');
    await page.click('#menu-button');
    await page.click('#options-button');
    await expect(optionsModal, 'should open options modal').toBeVisible();

    const packageHelperToggle = optionsModal.locator('#packageHelper');
    await expect(packageHelperToggle, 'should start enabled for Tester').toBeChecked();
    await packageHelperToggle.uncheck();
    await optionsModal.locator('#options-save').click();
    await expect(optionsModal, 'should close options modal after saving').not.toBeVisible();

    let boardMessage = await renderBoard();
    await expect(boardMessage, 'should show delivery board text for Tester').toContainText(
        'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:'
    );
    await expect(boardMessage, 'should hide helper annotations for Tester when disabled').not.toContainText('dystans:');
    await expect(
        boardMessage.locator('span[data-output-clickable="true"]'),
        'should remove clickable NPCs for Tester when helper disabled'
    ).toHaveCount(0);

    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Alt'});

    boardMessage = await renderBoard();
    await expect(boardMessage, 'should restore helper annotations for new character').toContainText('dystans:');
    await expect(
        boardMessage.locator('span[data-output-clickable="true"]'),
        'should restore clickable NPCs for Alt by default'
    ).toHaveCount(2);

    await page.click('#menu-button');
    await page.click('#options-button');
    await expect(optionsModal, 'should reopen options modal for Alt').toBeVisible();

    await expect(packageHelperToggle, 'should default to enabled for Alt').toBeChecked();
    await packageHelperToggle.uncheck();
    await optionsModal.locator('#options-save').click();
    await expect(optionsModal, 'should close options modal for Alt after saving').not.toBeVisible();

    boardMessage = await renderBoard();
    await expect(boardMessage, 'should hide helper annotations for Alt after disabling').not.toContainText('dystans:');
    await expect(
        boardMessage.locator('span[data-output-clickable="true"]'),
        'should remove clickable NPCs for Alt after disabling'
    ).toHaveCount(0);

    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester'});

    await page.click('#menu-button');
    await page.click('#options-button');
    await expect(optionsModal, 'should reopen options modal for Tester').toBeVisible();
    await expect(packageHelperToggle, 'should remember disabled state for Tester').not.toBeChecked();
    await optionsModal.locator('.btn-close').click();

    boardMessage = await renderBoard();
    await expect(boardMessage, 'should keep helper disabled for Tester without re-saving').not.toContainText('dystans:');
    await expect(
        boardMessage.locator('span[data-output-clickable="true"]'),
        'should keep NPCs non-clickable for Tester without re-saving'
    ).toHaveCount(0);

    const [testerSettings, altSettings] = await page.evaluate(() => {
        return [
            localStorage.getItem('Tester:settings'),
            localStorage.getItem('Alt:settings'),
        ];
    });

    expect(testerSettings, 'should persist Tester settings in local storage').toBeTruthy();
    expect(altSettings, 'should persist Alt settings in local storage').toBeTruthy();

    const parsedTester = testerSettings ? JSON.parse(testerSettings) : {};
    const parsedAlt = altSettings ? JSON.parse(altSettings) : {};

    expect(parsedTester.packageHelper, 'should store disabled package helper for Tester').toBe(false);
    expect(parsedAlt.packageHelper, 'should store disabled package helper for Alt').toBe(false);
});

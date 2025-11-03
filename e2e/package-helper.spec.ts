import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    primeCharInfo,
    pushText,
    submitCommand,
    waitForClientReady,
    waitForMapReady,
} from './support/mocks';

test.beforeEach(async ({context}) => {
    await primeCharInfo(context);
});

test('Package helper highlights NPCs and guides selected deliveries', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await ensureGameSocket(page);
    await waitForMapReady(page);
    await waitForClientReady(page);

    await page.evaluate(() => {
        const client: any = (globalThis as any).clientExtension;
        client.contentWidth = 140;
        client.Map.renderRoomByIdSilently?.(1);
        (globalThis as any).__leadToEvents = [];
        client.on('leadTo', (id: number) => {
            (globalThis as any).__leadToEvents.push(id ?? null);
        });
    });

    const path = await page.evaluate(() => {
        const client: any = (globalThis as any).clientExtension;
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
                const events = (globalThis as any).__leadToEvents ?? [];
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
        const client: any = (globalThis as any).clientExtension;
        client.contentWidth = 140;
        client.Map.renderRoomByIdSilently?.(1);
        (globalThis as any).__leadToEvents = [];
        client.on('leadTo', (id: number) => {
            (globalThis as any).__leadToEvents.push(id ?? null);
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
            return await page.evaluate(() => (globalThis as any).__leadToEvents?.length ?? 0);
        }, {message: 'should not emit lead to events when helper disabled'})
        .toBe(0);
});

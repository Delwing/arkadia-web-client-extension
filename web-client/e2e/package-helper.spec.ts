import {expect, test} from '@playwright/test';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    GMCP_PATHS,
    installMockWebSocket,
    mockNpcDownload,
    pushGmcp,
    pushText,
    waitForClientReady,
} from './support/mocks';

test.beforeEach(async ({context}) => {
    await mockNpcDownload(context);
    await installMockWebSocket(context);
});

test('Package helper highlights NPCs and guides selected deliveries', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await ensureGameSocket(page);
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester'});

    await page.evaluate(() => {
        const client: any = (window as any).clientExtension;
        client.contentWidth = 140;
        client.Map.currentRoom = {id: 101};
        (window as any).__leadToEvents = [];
        (window as any).__findPathCalls = [];
        window.addEventListener('leadTo', (event: any) => {
            (window as any).__leadToEvents.push(event.detail);
        });
        client.Map.findPath = (from, to) => {
            (window as any).__findPathCalls.push([from, to]);
            if (from === 101 && to === 200) {
                return [101, 150, 175, 200];
            }
            return null;
        };
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

    await pushText(page, boardText);

    const boardMessage = page
        .locator('#main_text_output_msg_wrapper .output_msg')
        .filter({hasText: 'Borgaf Kriegmann'})
        .last();

    await expect(boardMessage).toContainText('Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:');
    await expect(boardMessage).toContainText('dystans: 3');
    await expect(boardMessage).toContainText('dystans: --');

    const knownNpc = boardMessage.locator('span[data-output-clickable="true"]', {hasText: 'Borgaf Kriegmann'});
    const unknownNpc = boardMessage.locator('span[data-output-clickable="true"]', {hasText: 'Georg Blaskovitz'});

    await expect(knownNpc).toHaveCSS('color', 'rgb(95, 175, 95)');
    await expect(unknownNpc).toHaveCSS('color', 'rgb(168, 168, 168)');

    await knownNpc.click();

    await expect.poll(async () => {
        return await getLastOutgoingCommand(page);
    }).toBe('wybierz paczke 1');

    await pushText(page, 'Uprzejmy urzednik przekazuje ci jakas paczke.');

    const status = page.locator('#package-status');
    await expect(status).toBeVisible();
    await expect(status).toHaveText('📦: Borgaf Kriegmann');

    await expect.poll(async () => {
        return await page.evaluate(() => {
            const events = (window as any).__leadToEvents ?? [];
            return events.length ? events[events.length - 1] : null;
        });
    }).toBe(200);

    await expect.poll(async () => {
        return await page.evaluate(() => {
            const calls = (window as any).__findPathCalls ?? [];
            return calls.some((entry) => Array.isArray(entry) && entry[0] === 101 && entry[1] === 200);
        });
    }).toBe(true);
});

test('Package helper respects disabled setting and avoids assisting deliveries', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await ensureGameSocket(page);
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester'});

    await page.evaluate(() => {
        const client: any = (window as any).clientExtension;
        client.contentWidth = 140;
        client.Map.currentRoom = {id: 101};
        (window as any).__leadToEvents = [];
        (window as any).__findPathCalls = [];
        window.addEventListener('leadTo', (event: any) => {
            (window as any).__leadToEvents.push(event.detail);
        });
    });

    const optionsModal = page.locator('#options-modal');
    await page.click('#menu-button');
    await page.click('#options-button');
    await expect(optionsModal).toBeVisible();

    const packageHelperToggle = optionsModal.locator('#packageHelper');
    await expect(packageHelperToggle).toBeChecked();
    await packageHelperToggle.uncheck();

    await optionsModal.locator('#options-save').click();
    await expect(optionsModal).not.toBeVisible();

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

    await expect(boardMessage).toContainText('Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:');
    await expect(boardMessage).not.toContainText('dystans:');
    await expect(boardMessage.locator('span[data-output-clickable="true"]')).toHaveCount(0);

    await page.evaluate(async () => {
        const client: any = (window as any).clientExtension;
        await client.sendCommand('wybierz paczke 1');
    });

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
        })
        .toBe(false);

    await expect
        .poll(async () => {
            return await page.evaluate(() => (window as any).__leadToEvents?.length ?? 0);
        })
        .toBe(0);

    await expect
        .poll(async () => {
            return await page.evaluate(() => (window as any).__findPathCalls?.length ?? 0);
        })
        .toBe(0);
});

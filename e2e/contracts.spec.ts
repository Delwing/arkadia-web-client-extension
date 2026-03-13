import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    GMCP_PATHS,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
    waitForMapReady,
    waitForOutputContaining,
} from './support/mocks';
import type {Page} from '@playwright/test';

async function login(page: Page) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
    await waitForCharacter(page, 'TestChar');
}

// Use real mock map coordinates so client.Map.currentRoom gets set.
// Mock map data rooms in "Miasteczko Poslan":
//   Rynek: id=2, x=1, y=0
//   Kamienny Most: id=3, x=2, y=0
async function setRoom(page: Page, mapX: number, mapY: number, expectedRoomName: string) {
    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
        map: {x: mapX, y: mapY, name: 'Miasteczko Poslan'},
    });
    // Wait for location label to update, confirming currentRoom is set
    await expect(page.locator('#location-text')).toContainText(expectedRoomName, {timeout: 3000});
}

async function sendContractDialog(page: Page, npcDesc: string, count: string, item: string, quality: string | null, deadlineDays: string) {
    await pushText(page, `Pytasz ${npcDesc} o zlecenie.`);
    await waitForOutputContaining(page, `Pytasz ${npcDesc} o zlecenie`);

    const qualityPart = quality ? `, przynajmniej ${quality} jakosci` : '';
    await pushText(page, `Gruby ${npcDesc} do ciebie: Tak, mam pewne pilne zamowienie na miecze. Potrzebuje ${count} sztuk ${item}${qualityPart}.`);
    await waitForOutputContaining(page, `Potrzebuje ${count} sztuk`);

    await pushText(page, `Gruby ${npcDesc} do ciebie: Na realizacje zamowienia mam ${deadlineDays} dni, pozniej zapewne bede potrzebowac czego innego.`);
    await waitForOutputContaining(page, `${deadlineDays} dni`);
}

test.describe('Contracts', () => {
    test('contract dialog triggers contract capture and /zlecenia shows it', async ({page}) => {
        await login(page);
        await waitForMapReady(page);

        // Move to Rynek (id=2, x=1, y=0)
        await setRoom(page, 1, 0, 'Rynek');

        await sendContractDialog(page, 'kowala', 'trzy', 'mieczy', 'dobrej', 'dwa');

        await submitCommand(page, '/zlecenia');

        const contractsWindow = page.locator('.contracts-window');
        await expect(contractsWindow).toBeVisible({timeout: 3000});

        await expect(contractsWindow).toContainText('Rynek');
        await expect(contractsWindow).toContainText('mieczy');
        await expect(contractsWindow).toContainText('3');
    });

    test('new contract at same location replaces the old one', async ({page}) => {
        await login(page);
        await waitForMapReady(page);

        await setRoom(page, 1, 0, 'Rynek');

        // First contract
        await sendContractDialog(page, 'kowala', 'trzy', 'mieczy', 'dobrej', 'piec');

        // Second contract at same location replaces the first
        await sendContractDialog(page, 'kowala', 'pieciu', 'tarcz', 'sredniej', 'siedem');

        await submitCommand(page, '/zlecenia');

        const contractsWindow = page.locator('.contracts-window');
        await expect(contractsWindow).toBeVisible({timeout: 3000});

        // Should show only 1 contract (replaced)
        await expect(contractsWindow).toContainText('Zlecenia (1)');
        // Should show the newer contract's item
        await expect(contractsWindow).toContainText('tarcz');
    });

    test('contracts persist across page reload', async ({page}) => {
        await login(page);
        await waitForMapReady(page);

        await setRoom(page, 1, 0, 'Rynek');
        await sendContractDialog(page, 'kowala', 'trzy', 'mieczy', 'dobrej', 'dziesiec');

        await submitCommand(page, '/zlecenia');

        const contractsWindow = page.locator('.contracts-window');
        await expect(contractsWindow).toBeVisible({timeout: 3000});
        await expect(contractsWindow).toContainText('Rynek');

        await page.keyboard.press('Escape');

        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
        await waitForCharacter(page, 'TestChar');
        await waitForMapReady(page);

        await submitCommand(page, '/zlecenia');

        const contractsWindowAfter = page.locator('.contracts-window');
        await expect(contractsWindowAfter).toBeVisible({timeout: 3000});
        await expect(contractsWindowAfter).toContainText('Rynek');
        await expect(contractsWindowAfter).toContainText('mieczy');
    });

    test('no contract response removes contract for that location', async ({page}) => {
        await login(page);
        await waitForMapReady(page);

        // Create contract at Rynek
        await setRoom(page, 1, 0, 'Rynek');
        await sendContractDialog(page, 'kowala', 'trzy', 'mieczy', 'dobrej', 'piec');

        await submitCommand(page, '/zlecenia');

        const contractsWindow = page.locator('.contracts-window');
        await expect(contractsWindow).toBeVisible({timeout: 3000});
        await expect(contractsWindow).toContainText('Zlecenia (1)');

        await page.keyboard.press('Escape');

        // Still at Rynek — NPC says no contract
        await pushText(page, 'Pytasz kowala o zlecenie.');
        await waitForOutputContaining(page, 'Pytasz kowala o zlecenie');
        await pushText(page, 'Gruby kowal do ciebie: Nie, w tej chwili niczego mi nie trzeba. Zajrzyj moze za jakis czas.');
        await waitForOutputContaining(page, 'niczego mi nie trzeba');

        await submitCommand(page, '/zlecenia');

        const contractsWindowAfter = page.locator('.contracts-window');
        await expect(contractsWindowAfter).toBeVisible({timeout: 3000});
        await expect(contractsWindowAfter).toContainText('Brak aktywnych zlecen');
    });
});

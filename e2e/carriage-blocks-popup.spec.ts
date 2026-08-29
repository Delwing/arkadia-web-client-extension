import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    primeCharInfo,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
    waitForOutputContaining,
} from './support/mocks';

async function getStoredBlocks(page: Page): Promise<number[] | null> {
    return await page.evaluate(() => {
        const raw = localStorage.getItem('carriage_blocked_rooms');
        return raw ? JSON.parse(raw) : null;
    });
}

async function blockRoom(page: Page, roomId: number) {
    await submitCommand(page, `/ustaw ${roomId}`);
    await submitCommand(page, '/wozblok');
}

async function openBlocksWindow(page: Page) {
    await submitCommand(page, '/wozw');
    const carriagesWindow = page.locator('.carriages-window');
    await expect(carriagesWindow).toBeVisible();
    await carriagesWindow.getByRole('button', {name: 'Blokady'}).click();
    const blocksWindow = page.locator('.carriage-blocks-window');
    await expect(blocksWindow).toBeVisible();
    return blocksWindow;
}

test.describe('Carriage blocks popup', () => {
    test('lists blocked rooms, deletes one and clears all', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'Blocker'});
        await waitForMapReady(page);

        await blockRoom(page, 100);
        await waitForOutputContaining(page, 'Woz nie przejedzie');
        await blockRoom(page, 101);
        await expect.poll(() => getStoredBlocks(page)).toEqual([100, 101]);

        const blocksWindow = await openBlocksWindow(page);
        const items = blocksWindow.locator('.carriage-block-item');
        await expect(items).toHaveCount(2);
        await expect(items.first()).toContainText('(100)');

        // Deleting one row leaves the other.
        await items.first().getByTitle('Usun blokade').click();
        await expect(items).toHaveCount(1);
        await expect(items.first()).toContainText('(101)');
        await expect.poll(() => getStoredBlocks(page)).toEqual([101]);

        // Clear-all wants a confirming second click before it acts.
        const clearButton = blocksWindow.getByRole('button', {name: 'Wyczysc'});
        await clearButton.click();
        await expect.poll(() => getStoredBlocks(page), {message: 'first click must not clear yet'}).toEqual([101]);
        await blocksWindow.getByRole('button', {name: 'Na pewno?'}).click();
        await expect(blocksWindow.locator('.popup-empty')).toBeVisible();
        await expect.poll(() => getStoredBlocks(page)).toEqual([]);
    });

    test('previews a blocked room on a static map popup', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'Previewer'});
        await waitForMapReady(page);

        await blockRoom(page, 100);
        await waitForOutputContaining(page, 'Woz nie przejedzie');

        const blocksWindow = await openBlocksWindow(page);
        const items = blocksWindow.locator('.carriage-block-item');
        await expect(items).toHaveCount(1);

        await items.first().getByRole('button', {name: 'Mapa'}).click();
        await expect(page.locator('.static-map-popup')).toBeVisible();
    });
});

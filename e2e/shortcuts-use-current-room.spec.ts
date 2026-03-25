import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    GMCP_PATHS,
    pushGmcp,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import type {Page} from '@playwright/test';

const POSLAN_MAP_NAME = 'Miasteczko Poslan';

/** Set the current room on the map via GMCP room.info. */
async function setCurrentRoom(page: Page, roomId: number, name: string, x: number) {
    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
        num: roomId,
        id: roomId,
        name,
        zone: POSLAN_MAP_NAME,
        exits: {},
        map: {
            x,
            y: 0,
            name: POSLAN_MAP_NAME,
        },
    });
    const locationLabel = page.locator('#location-text');
    await expect(locationLabel).toContainText(`#${roomId}`, {timeout: 5000});
}

async function openShortcutsModal(page: Page) {
    await page.click('#menu-button');
    await page.click('#shortcuts-button');
    const modal = page.locator('#shortcuts-modal');
    await modal.waitFor({state: 'visible', timeout: 5000});
    return modal;
}

test.describe('Shortcuts "use current room" flow', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);
    });

    test('Aktualna button fills location field with current room ID', async ({page}) => {
        await setCurrentRoom(page, 2, 'Rynek', 1);

        const modal = await openShortcutsModal(page);

        // Click the "Dodaj" button to show the add form
        await modal.locator('button', {hasText: 'Dodaj'}).click();

        // The location input should be empty initially
        const locInput = modal.locator('input[type="number"]');
        await expect(locInput).toHaveValue('');

        // Click the "Aktualna" button to fill in the current room ID
        await modal.locator('button', {hasText: 'Aktualna'}).click();

        // The location input should now contain the room ID "2"
        await expect(locInput).toHaveValue('2');
    });

    test('full add shortcut flow with current room', async ({page}) => {
        await setCurrentRoom(page, 2, 'Rynek', 1);

        const modal = await openShortcutsModal(page);

        // Click "Dodaj" to show the form
        await modal.locator('button', {hasText: 'Dodaj'}).click();

        // Fill in the shortcut name
        const nameInput = modal.locator('input[type="text"]').first();
        await nameInput.fill('rynek');

        // Use the "Aktualna" button for location
        await modal.locator('button', {hasText: 'Aktualna'}).click();

        // Verify location was filled
        const locInput = modal.locator('input[type="number"]');
        await expect(locInput).toHaveValue('2');

        // Fill description
        const labelInput = modal.locator('input[type="text"]').nth(1);
        await labelInput.fill('Rynek miejski');

        // Save the shortcut
        await modal.locator('button', {hasText: 'Zapisz'}).click();

        // Verify the shortcut was saved to storage
        const stored = await page.evaluate(() => {
            const raw = localStorage.getItem('shortcuts');
            return raw ? JSON.parse(raw) : null;
        });
        expect(stored).toEqual([{key: 'rynek', id: 2, label: 'Rynek miejski'}]);
    });

    test('Aktualna button works for a different room', async ({page}) => {
        await setCurrentRoom(page, 1, 'Poczta', 0);

        const modal = await openShortcutsModal(page);
        await modal.locator('button', {hasText: 'Dodaj'}).click();

        const locInput = modal.locator('input[type="number"]');

        // Use current room
        await modal.locator('button', {hasText: 'Aktualna'}).click();
        await expect(locInput).toHaveValue('1');
    });
});

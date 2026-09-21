import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    GMCP_PATHS,
    pushGmcp,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import type { Page } from '@playwright/test';

// Rooms from the mock map: 3 = "Kamienny Most", 2 = "Rynek", both in "Miasteczko Poslan".
const ROOM_ID = 3;
const OTHER_ROOM_ID = 1;
const POSLAN_MAP_NAME = 'Miasteczko Poslan';

const modal = (page: Page) => page.locator('#places-modal');
const noteBox = (page: Page) => modal(page).locator('textarea.places-note');

async function openFromMapMenu(page: Page, roomId: number, item: 'Notatka' | 'Dodaj skrót') {
    await page.evaluate((id) => {
        document.getElementById('map')!.dispatchEvent(new CustomEvent('roomcontextmenu', {
            bubbles: true,
            cancelable: true,
            detail: { roomId: id, position: { x: 50, y: 50 } },
        }));
    }, roomId);
    const menu = page.locator('#context-menu');
    await expect(menu).toHaveClass(/show/);
    await menu.locator('button', { hasText: item }).click();
    await expect(modal(page)).toBeVisible();
}

async function closePlaces(page: Page) {
    await modal(page).locator('.btn-close').click();
    await expect(modal(page)).not.toBeVisible();
}

async function setCurrentRoom(page: Page, roomId: number, name: string, x: number) {
    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
        num: roomId,
        id: roomId,
        name,
        zone: POSLAN_MAP_NAME,
        exits: {},
        map: { x, y: 0, name: POSLAN_MAP_NAME },
    });
    await expect(page.locator('#location-text')).toContainText(`#${roomId}`, { timeout: 5000 });
}

async function readNote(page: Page, roomId: number): Promise<string | null> {
    return page.evaluate((id) => new Promise<string | null>((resolve, reject) => {
        const req = indexedDB.open('ArkadiaLocationNotesDB', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('notes', { keyPath: 'id' });
        req.onsuccess = () => {
            const get = req.result.transaction(['notes'], 'readonly').objectStore('notes').get(id);
            get.onsuccess = () => resolve(get.result ? get.result.note : null);
            get.onerror = () => reject(new Error('read failed'));
        };
        req.onerror = () => reject(new Error('open failed'));
    }), roomId);
}

async function clearNotes(page: Page) {
    await page.evaluate(() => new Promise<void>((resolve) => {
        const req = indexedDB.open('ArkadiaLocationNotesDB', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('notes', { keyPath: 'id' });
        req.onsuccess = () => {
            const tx = req.result.transaction(['notes'], 'readwrite');
            tx.objectStore('notes').clear();
            tx.oncomplete = () => resolve();
        };
    }));
}

const storedShortcuts = (page: Page) => page.evaluate(() => {
    const raw = localStorage.getItem('shortcuts');
    return raw ? JSON.parse(raw) : null;
});

test.describe('Miejsca (skróty i notatki lokacji)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);
        await clearNotes(page);
    });

    test('"Notatka" on the map opens the room in Miejsca and the note saves itself', async ({ page }) => {
        await openFromMapMenu(page, ROOM_ID, 'Notatka');
        const hero = modal(page).locator('.places-hero__title');
        await expect(hero).toContainText('Kamienny Most');
        await expect(hero).toContainText(POSLAN_MAP_NAME);
        await expect(hero).toContainText(`#${ROOM_ID}`);
        await expect(noteBox(page)).toBeFocused();

        await noteBox(page).fill('Most pilnuje straznik');
        await expect.poll(() => readNote(page, ROOM_ID), { message: 'note should autosave' }).toBe('Most pilnuje straznik');

        // Shows up in the list, and again when reopened.
        await expect(modal(page).locator('.places-row', { hasText: 'Kamienny Most' })).toContainText('Most pilnuje straznik');
        await closePlaces(page);
        await openFromMapMenu(page, ROOM_ID, 'Notatka');
        await expect(noteBox(page)).toHaveValue('Most pilnuje straznik');
    });

    test('clearing the note deletes it', async ({ page }) => {
        await openFromMapMenu(page, ROOM_ID, 'Notatka');
        await noteBox(page).fill('Do usuniecia');
        await expect.poll(() => readNote(page, ROOM_ID)).toBe('Do usuniecia');
        await noteBox(page).fill('');
        await expect.poll(() => readNote(page, ROOM_ID), { message: 'empty note should be deleted' }).toBeNull();
    });

    test('notes for different rooms are independent', async ({ page }) => {
        await openFromMapMenu(page, ROOM_ID, 'Notatka');
        await noteBox(page).fill('Pierwsza');
        await expect.poll(() => readNote(page, ROOM_ID)).toBe('Pierwsza');
        await closePlaces(page);

        await openFromMapMenu(page, OTHER_ROOM_ID, 'Notatka');
        await expect(noteBox(page)).toHaveValue('');
        await noteBox(page).fill('Druga');
        await expect.poll(() => readNote(page, OTHER_ROOM_ID)).toBe('Druga');
        expect(await readNote(page, ROOM_ID)).toBe('Pierwsza');
    });

    test('"Dodaj skrót" on the map adds a /idz shortcut for that room', async ({ page }) => {
        await openFromMapMenu(page, ROOM_ID, 'Dodaj skrót');
        const field = modal(page).locator('.places-shortcut input');
        await expect(field).toBeFocused();
        await field.fill('most');
        await field.press('Enter');
        await expect.poll(() => storedShortcuts(page)).toEqual([{ key: 'most', id: ROOM_ID, label: '' }]);
        await expect(modal(page).locator('.places-row', { hasText: 'Kamienny Most' }).locator('.places-key')).toHaveText('most');
    });

    test('a shortcut name /idz cannot take is refused', async ({ page }) => {
        await openFromMapMenu(page, ROOM_ID, 'Dodaj skrót');
        const field = modal(page).locator('.places-shortcut input');
        await field.fill('zły most');
        await field.press('Enter');
        await expect(modal(page).locator('.popup-field__error')).toBeVisible();
        expect(await storedShortcuts(page)).toBeNull();
    });

    test('"Tutaj" picks the current room', async ({ page }) => {
        await setCurrentRoom(page, 2, 'Rynek', 1);
        await page.click('#menu-button');
        await page.click('#places-button');
        await expect(modal(page)).toBeVisible();

        await modal(page).getByRole('button', { name: 'Tutaj' }).click();
        await expect(modal(page).locator('.places-hero__title')).toContainText('#2');
        await modal(page).getByRole('button', { name: 'Dodaj skrót' }).click();
        const field = modal(page).locator('.places-shortcut input');
        await field.fill('rynek');
        await field.press('Enter');
        await expect.poll(() => storedShortcuts(page)).toEqual([{ key: 'rynek', id: 2, label: '' }]);
    });

    test('filters, search and "Usuń miejsce"', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('shortcuts', JSON.stringify([{ key: 'poczta', id: 1, label: 'stary opis' }])));
        await openFromMapMenu(page, ROOM_ID, 'Notatka');
        await noteBox(page).fill('Notatka o moscie');
        await expect.poll(() => readNote(page, ROOM_ID)).toBe('Notatka o moscie');

        const rows = modal(page).locator('.places-row');
        await expect(rows).toHaveCount(2);
        await modal(page).locator('.dialog-tab', { hasText: 'Skróty' }).click();
        await expect(rows).toHaveCount(1);
        await modal(page).locator('.dialog-tab', { hasText: 'Notatki' }).click();
        await expect(rows).toHaveCount(1);
        await modal(page).locator('.dialog-tab', { hasText: 'Wszystkie' }).click();
        await modal(page).locator('.places-list__search input').fill('poczta');
        await expect(rows).toHaveCount(1);

        // The old shortcut description can be folded into the note.
        await rows.first().click();
        await modal(page).getByRole('button', { name: 'Przenieś do notatki' }).click();
        await expect.poll(() => readNote(page, 1)).toBe('stary opis');
        await expect.poll(() => storedShortcuts(page)).toEqual([{ key: 'poczta', id: 1, label: '' }]);

        await modal(page).getByRole('button', { name: 'Usuń miejsce' }).click();
        await expect.poll(() => storedShortcuts(page)).toEqual([]);
        await expect.poll(() => readNote(page, 1)).toBeNull();
    });
});

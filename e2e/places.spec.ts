import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    GMCP_PATHS,
    mockMapDownloads,
    pushGmcp,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import type { Page } from '@playwright/test';
import mapData from './support/mock-data/map-data.json' with { type: 'json' };

// Rooms from the mock map: 3 = "Kamienny Most", 2 = "Rynek", both in "Miasteczko Poslan".
const ROOM_ID = 3;
const OTHER_ROOM_ID = 1;
const POSLAN_MAP_NAME = 'Miasteczko Poslan';

const modal = (page: Page) => page.locator('#places-modal');
const noteBox = (page: Page) => modal(page).locator('textarea.places-note');

async function openFromMapMenu(page: Page, roomId: number, item: 'Notatka' | 'Skrót') {
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

    test('opened from the map, the room preview is drawn, not left blank', async ({ page }) => {
        // The window is still hidden when the preview mounts; it must take its
        // size once the window shows, not keep the 0x0 it started with.
        await openFromMapMenu(page, ROOM_ID, 'Notatka');
        const canvas = modal(page).locator('.places-map canvas').first();
        await expect.poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).width)).toBeGreaterThan(100);
    });

    test('"Skrót" on the map adds a /idz shortcut for that room', async ({ page }) => {
        await openFromMapMenu(page, ROOM_ID, 'Skrót');
        const field = modal(page).locator('.places-shortcut input');
        await expect(field).toBeFocused();
        await field.fill('most');
        await field.press('Enter');
        await expect.poll(() => storedShortcuts(page)).toEqual([{ key: 'most', id: ROOM_ID, label: '' }]);
        await expect(modal(page).locator('.places-row', { hasText: 'Kamienny Most' }).locator('.places-key')).toHaveText('most');
    });

    test('a shortcut name /idz cannot take is refused', async ({ page }) => {
        await openFromMapMenu(page, ROOM_ID, 'Skrót');
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

    test('a room found on the map (not the current one) can get a note and a shortcut', async ({ page }) => {
        await page.click('#menu-button');
        await page.click('#places-button');
        await expect(modal(page)).toBeVisible();

        const search = modal(page).locator('.places-list__search input');
        await search.fill('kamienny');
        const match = modal(page).locator('.places-row--map', { hasText: 'Kamienny Most' });
        await expect(match).toBeVisible();
        await match.click();
        // Picked from the list: highlighted there, not repeated as a separate unsaved entry.
        await expect(match).toHaveClass(/is-selected/);
        await expect(modal(page).locator('.places-row', { hasText: 'niezapisane' })).toHaveCount(0);
        await expect(modal(page).locator('.places-hero__title')).toContainText(`#${ROOM_ID}`);

        await noteBox(page).fill('Dodane zdalnie');
        await expect.poll(() => readNote(page, ROOM_ID)).toBe('Dodane zdalnie');
        await modal(page).getByRole('button', { name: 'Dodaj skrót' }).click();
        const field = modal(page).locator('.places-shortcut input');
        await field.fill('most');
        await field.press('Enter');
        await expect.poll(() => storedShortcuts(page)).toEqual([{ key: 'most', id: ROOM_ID, label: '' }]);

        // Saved now, so it is a place and no longer offered from the map; #id finds rooms too.
        await expect(modal(page).locator('.places-row--map', { hasText: 'Kamienny Most' })).toHaveCount(0);
        await search.fill('1');
        await expect(modal(page).locator('.places-row--map')).toHaveCount(1);

        await modal(page).getByTitle('Wyczyść wyszukiwanie').click();
        await expect(search).toHaveValue('');
        await expect(modal(page).locator('.places-row--map')).toHaveCount(0);
    });

    test('filters, search and "Usuń miejsce"', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('shortcuts', JSON.stringify([{ key: 'poczta', id: 1, label: 'stary opis' }])));
        await openFromMapMenu(page, ROOM_ID, 'Notatka');
        await noteBox(page).fill('Notatka o moscie');
        await expect.poll(() => readNote(page, ROOM_ID)).toBe('Notatka o moscie');

        const rows = modal(page).locator('.places-row');
        await expect(rows).toHaveCount(2);
        await modal(page).locator('.places-filter .dialog-tab', { hasText: 'Skróty' }).click();
        await expect(rows).toHaveCount(1);
        await modal(page).locator('.places-filter .dialog-tab', { hasText: 'Notatki' }).click();
        await expect(rows).toHaveCount(1);
        await modal(page).locator('.places-filter .dialog-tab', { hasText: 'Wszystkie' }).click();
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

    test('deleting a place leaves the right pane empty, not showing what was deleted', async ({ page }) => {
        await openFromMapMenu(page, ROOM_ID, 'Notatka');
        await noteBox(page).fill('Do skasowania');
        await expect.poll(() => readNote(page, ROOM_ID)).toBe('Do skasowania');
        await expect(modal(page).locator('.places-hero__title')).toContainText('Kamienny Most');

        await modal(page).getByRole('button', { name: 'Usuń miejsce' }).click();
        await expect.poll(() => readNote(page, ROOM_ID)).toBeNull();
        await expect(modal(page).locator('.places-detail--empty'), 'the pane goes back to its prompt').toBeVisible();
        await expect(modal(page).locator('.places-hero__title')).toHaveCount(0);
        await expect(modal(page).locator('.places-row', { hasText: 'Kamienny Most' })).toHaveCount(0);
    });

    test('right-click on a list row offers Idź, Prowadź and Usuń miejsce', async ({ page }) => {
        await setCurrentRoom(page, OTHER_ROOM_ID, 'Poczta', 0);
        await openFromMapMenu(page, ROOM_ID, 'Skrót');
        const field = modal(page).locator('.places-shortcut input');
        await field.fill('most');
        await field.press('Enter');
        await expect.poll(() => storedShortcuts(page)).toEqual([{ key: 'most', id: ROOM_ID, label: '' }]);

        const row = modal(page).locator('.places-row', { hasText: 'Kamienny Most' });
        await row.click({ button: 'right' });
        const menu = page.locator('#context-menu');
        await expect(menu).toHaveClass(/show/);
        await expect(menu).toContainText('Kamienny Most');
        await expect(menu.locator('button')).toHaveText(['Idź', 'Prowadź', 'Usuń miejsce']);

        // Idź walks there (by the shortcut name) and closes the window.
        await menu.locator('button', { hasText: 'Idź' }).click();
        await expect(modal(page)).not.toBeVisible();
        await expect(page.locator('#location-text'), '/idz sets the walk target').toContainText(`→ #${ROOM_ID}`);

        // Usuń miejsce forgets it from the list, without opening the pane.
        await page.click('#menu-button');
        await page.click('#places-button');
        await expect(modal(page)).toBeVisible();
        await row.click({ button: 'right' });
        await expect(menu).toHaveClass(/show/);
        await menu.locator('button', { hasText: 'Usuń miejsce' }).click();
        await expect.poll(() => storedShortcuts(page)).toEqual([]);
        await expect(row).toHaveCount(0);
        await expect(modal(page).locator('.places-detail--empty')).toBeVisible();
    });

    test('rooms a plugin notes are searchable and get their own Inne tab', async ({ page }) => {
        const pluginUrl = 'https://example.com/places-notes-plugin.js';
        await page.route(`${pluginUrl}**`, (route) => route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `export async function init(api) {
                api.locationNotes.set(${ROOM_ID}, 'Skarb pod mostem');
                return { name: 'Notki Test', version: '1.0.0' };
            }`,
        }));
        await page.click('#menu-button');
        await page.click('#scripts-button');
        const scripts = page.locator('#scripts-modal');
        await scripts.getByRole('button', { name: 'Dodaj plugin' }).click();
        await page.locator('.plugin-route', { hasText: 'Z adresu URL' }).click();
        const dialog = page.locator('.modal', { hasText: 'Dodaj skrypt z URL' }).last();
        await dialog.getByPlaceholder('URL skryptu').fill(pluginUrl);
        await dialog.getByRole('button', { name: 'Dodaj', exact: true }).click();
        await expect(scripts.getByText('Notki Test')).toBeVisible();
        await scripts.locator('.btn-close').first().click();
        await expect(scripts).not.toBeVisible();

        await page.click('#menu-button');
        await page.click('#places-button');
        await expect(modal(page)).toBeVisible();
        const rows = modal(page).locator('.places-row');
        const pluginTab = modal(page).locator('.places-filter .dialog-tab', { hasText: 'Inne' });
        await expect(pluginTab).toContainText('1');

        await modal(page).locator('.places-list__search input').fill('skarb');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('Kamienny Most');
        await expect(rows.first()).toContainText('Skarb pod mostem');

        await modal(page).locator('.places-list__search input').fill('');
        await modal(page).locator('.places-filter .dialog-tab', { hasText: 'Notatki' }).click();
        await expect(rows).toHaveCount(0);
        await pluginTab.click();
        await expect(rows).toHaveCount(1);

        // Nothing of yours is saved there: the plugin note is read-only, nothing to delete.
        await rows.first().click();
        await expect(modal(page).locator('.places-other', { hasText: 'Wtyczka: Notki Test' })).toContainText('Skarb pod mostem');
        await expect(modal(page).getByRole('button', { name: 'Usuń miejsce' })).toBeDisabled();
    });

    test('right-click on a room found on the map offers only Idź and Prowadź', async ({ page }) => {
        await setCurrentRoom(page, OTHER_ROOM_ID, 'Poczta', 0);
        await page.click('#menu-button');
        await page.click('#places-button');
        await expect(modal(page)).toBeVisible();
        await modal(page).locator('.places-list__search input').fill('kamienny');

        const match = modal(page).locator('.places-row--map', { hasText: 'Kamienny Most' });
        await expect(match).toBeVisible();
        await match.click({ button: 'right' });
        const menu = page.locator('#context-menu');
        await expect(menu).toHaveClass(/show/);
        await expect(menu.locator('button'), 'nothing of yours is saved there yet').toHaveText(['Idź', 'Prowadź']);

        await menu.locator('button', { hasText: 'Idź' }).click();
        await expect(page.locator('#location-text'), '/idz by room number').toContainText(`→ #${ROOM_ID}`);
    });
});

test.describe('Miejsca: opisy z mapy', () => {
    // The mapper's description is stored with line breaks written as a literal backslash-n.
    test.beforeEach(async ({ context, page }) => {
        const data = structuredClone(mapData) as typeof mapData;
        const room = data.flatMap(a => a.rooms).find(r => r.id === ROOM_ID)!;
        (room.userData as Record<string, string>).description = 'Stary kamienny most.\\n  Pod nim mieszka troll.';
        await mockMapDownloads(context, { mapData: data as never });
        await page.goto('/');
        await waitForCommandInput(page);
        await waitForMapReady(page);
    });

    test('described rooms have their own tab and show the description as preformatted text', async ({ page }) => {
        await page.click('#menu-button');
        await page.click('#places-button');
        await expect(modal(page)).toBeVisible();

        const tab = modal(page).locator('.dialog-tab', { hasText: 'Opisy' });
        await expect(tab).toContainText('1');
        await tab.click();
        const row = modal(page).locator('.places-row--map', { hasText: 'Kamienny Most' });
        // The row only names the room; the description belongs to the place pane.
        await expect(row).toContainText(POSLAN_MAP_NAME);
        await expect(row).not.toContainText('Stary kamienny most.');

        // ...but it is searchable.
        await modal(page).locator('.places-list__search input').fill('troll');
        await expect(row).toBeVisible();
        await row.click();

        const pre = modal(page).locator('pre.places-other__pre');
        await expect(pre).toHaveText('Stary kamienny most.\n  Pod nim mieszka troll.');
        // Read-only: nothing to edit it with.
        await expect(modal(page).locator('.places-other textarea, .places-other input')).toHaveCount(0);
    });

    test('map search finds rooms by their description', async ({ page }) => {
        await page.click('#menu-button');
        await page.click('#places-button');
        await modal(page).locator('.places-list__search input').fill('troll');
        await expect(modal(page).locator('.places-row--map', { hasText: 'Kamienny Most' })).toBeVisible();
    });
});

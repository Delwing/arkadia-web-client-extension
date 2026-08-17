import { expect, test } from './support/fixtures';
import { waitForMapReady } from './support/mocks';

/**
 * Location notes in forge-ui. Both surfaces run on shared code that binds to
 * things the stock UI declares in its own HTML / mount code, so forge has to
 * provide them itself: `#map-note-tooltip` for the left-click tooltip, and a
 * mount for the stock `LocationNoteEditor` for the "Notatka" context-menu item.
 */

const CONTEXT_MENU = '.alt-context-menu';
const NOTE_TOOLTIP = '#map-note-tooltip';
const NOTE_MODAL_TITLE = 'Notatka lokacji';

// A room that exists in the mock map data ("Kamienny Most", Miasteczko Poslan).
const ROOM_ID = 3;

type Page = import('@playwright/test').Page;

async function dispatchRoomEvent(page: Page, type: string, roomId: number): Promise<void> {
    await page.evaluate(([eventType, id]) => {
        document.getElementById('map')!.dispatchEvent(new CustomEvent(eventType as string, {
            bubbles: true,
            cancelable: true,
            detail: { roomId: id, position: { x: 50, y: 50 } },
        }));
    }, [type, roomId] as [string, number]);
}

/** Write/remove a note straight in IndexedDB (the storage has no cache). */
async function seedNote(page: Page, roomId: number, note: string | null): Promise<void> {
    await page.evaluate(([id, text]) => {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open('ArkadiaLocationNotesDB', 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('notes')) {
                    db.createObjectStore('notes', { keyPath: 'id' });
                }
            };
            req.onsuccess = () => {
                const tx = req.result.transaction(['notes'], 'readwrite');
                const store = tx.objectStore('notes');
                if (text === null) store.delete(id as number);
                else store.put({ id, note: text, updatedAt: 1 });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(new Error('Failed to write note'));
            };
            req.onerror = () => reject(new Error('Failed to open IndexedDB'));
        });
    }, [roomId, note] as [number, string | null]);
}

test.describe('forge location notes', () => {
    // Forge boots the client AND the map renderer before any of this is reachable.
    test.describe.configure({ timeout: 30000 });

    test.beforeEach(async ({ page }) => {
        await page.goto('/forge-ui/');
        // Disconnected, the login gate covers the HUD; dismiss it to reach the map.
        await page.locator('.gate__close').click();
        await waitForMapReady(page);
        await seedNote(page, ROOM_ID, null);
    });

    test('left-clicking a room shows its note in the map tooltip', async ({ page }) => {
        await seedNote(page, ROOM_ID, 'Schowek pod mostem');

        await dispatchRoomEvent(page, 'roomclick', ROOM_ID);

        const tooltip = page.locator(NOTE_TOOLTIP);
        await expect(tooltip).toHaveClass(/show/);
        await expect(tooltip).toContainText('Notatka:');
        await expect(tooltip).toContainText('Schowek pod mostem');
    });

    test('a room with no note shows no tooltip', async ({ page }) => {
        await dispatchRoomEvent(page, 'roomclick', ROOM_ID);

        // Give the async note lookup a chance to (not) paint anything.
        await expect(page.locator(NOTE_TOOLTIP)).not.toHaveClass(/show/);
    });

    test('"Notatka" in the map context menu opens the note editor', async ({ page }) => {
        await dispatchRoomEvent(page, 'roomcontextmenu', ROOM_ID);
        const menu = page.locator(CONTEXT_MENU);
        await expect(menu).toBeVisible();
        await menu.locator('button', { hasText: 'Notatka' }).click();

        const modal = page.locator('.modal-content').filter({ hasText: NOTE_MODAL_TITLE });
        await expect(modal).toBeVisible();
        await expect(modal.locator('.text-muted')).toContainText(`ID: ${ROOM_ID}`);
        // The dialog is portaled to <body>, outside forge's modal scope — it only
        // gets Bootstrap (and the forge theme) if it is tagged on arrival.
        await expect(page.locator('div.modal.forge-portaled-modal')).toHaveCount(1);
    });

    test('a note saved from the editor shows up in the tooltip', async ({ page }) => {
        await dispatchRoomEvent(page, 'roomcontextmenu', ROOM_ID);
        await page.locator(CONTEXT_MENU).locator('button', { hasText: 'Notatka' }).click();

        const modal = page.locator('.modal-content').filter({ hasText: NOTE_MODAL_TITLE });
        await expect(modal).toBeVisible();
        await modal.locator('textarea').fill('Notatka z forge');
        await modal.locator('button', { hasText: 'Zapisz' }).click();
        await expect(modal).not.toBeVisible();

        await dispatchRoomEvent(page, 'roomclick', ROOM_ID);
        await expect(page.locator(NOTE_TOOLTIP)).toContainText('Notatka z forge');
    });
});

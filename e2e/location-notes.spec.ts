import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

const CONTEXT_MENU_SELECTOR = '#context-menu';
const NOTE_MODAL_TITLE = 'Notatka lokacji';

// Room IDs from mock map data that exist and have known names/areas
const ROOM_ID = 3; // "Kamienny Most" in "Miasteczko Poslan"

async function dispatchRoomContextMenu(
    page: import('@playwright/test').Page,
    roomId: number,
): Promise<void> {
    await page.evaluate((id) => {
        const mapEl = document.getElementById('map');
        const event = new CustomEvent('roomcontextmenu', {
            bubbles: true,
            cancelable: true,
            detail: { roomId: id, position: { x: 50, y: 50 } },
        });
        mapEl!.dispatchEvent(event);
    }, roomId);
}

async function openNoteModalViaContextMenu(
    page: import('@playwright/test').Page,
    roomId: number,
): Promise<void> {
    await dispatchRoomContextMenu(page, roomId);
    const menu = page.locator(CONTEXT_MENU_SELECTOR);
    await expect(menu).toHaveClass(/show/);
    await menu.locator('button', { hasText: 'Notatka' }).click();
}

/** Return a locator scoped to the LocationNoteEditor modal. */
function noteModal(page: import('@playwright/test').Page) {
    // React-Bootstrap appends the modal to the DOM when show=true. We locate
    // it by the unique title text inside .modal-content.
    return page.locator('.modal-content').filter({ hasText: NOTE_MODAL_TITLE });
}

/** Clear any saved note for a room via IndexedDB so tests start clean. */
async function clearNote(page: import('@playwright/test').Page, roomId: number): Promise<void> {
    await page.evaluate((id) => {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open('ArkadiaLocationNotesDB', 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('notes')) {
                    db.createObjectStore('notes', { keyPath: 'id' });
                }
            };
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction(['notes'], 'readwrite');
                tx.objectStore('notes').delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(new Error('Failed to delete note'));
            };
            req.onerror = () => reject(new Error('Failed to open IndexedDB'));
        });
    }, roomId);
}

/** Read a saved note from IndexedDB directly. Returns null if not found. */
async function readNote(page: import('@playwright/test').Page, roomId: number): Promise<string | null> {
    return await page.evaluate((id) => {
        return new Promise<string | null>((resolve, reject) => {
            const req = indexedDB.open('ArkadiaLocationNotesDB', 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('notes')) {
                    db.createObjectStore('notes', { keyPath: 'id' });
                }
            };
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction(['notes'], 'readonly');
                const getReq = tx.objectStore('notes').get(id);
                getReq.onsuccess = () => {
                    const result = getReq.result as { note: string } | undefined;
                    resolve(result ? result.note : null);
                };
                getReq.onerror = () => reject(new Error('Failed to read note'));
            };
            req.onerror = () => reject(new Error('Failed to open IndexedDB'));
        });
    }, roomId);
}

test.describe('LocationNoteEditor', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);
        await clearNote(page, ROOM_ID);
    });

    test('modal opens when "Notatka" is clicked in the map context menu', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);

        const modal = noteModal(page);
        await expect(modal).toBeVisible();
        await expect(modal).toContainText(NOTE_MODAL_TITLE);
    });

    test('modal shows the room ID in the header info', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);

        const modal = noteModal(page);
        await expect(modal).toBeVisible();
        await expect(modal.locator('.text-muted')).toContainText(`ID: ${ROOM_ID}`);
    });

    test('modal shows room name and area from map data', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);

        const modal = noteModal(page);
        await expect(modal).toBeVisible();

        // Room 3 = "Kamienny Most" in "Miasteczko Poslan" from mock map data
        const roomInfo = modal.locator('.text-muted');
        await expect(roomInfo).toContainText('Kamienny Most');
        await expect(roomInfo).toContainText('Miasteczko Poslan');
    });

    test('textarea is visible and empty when no note exists for the room', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);

        const modal = noteModal(page);
        await expect(modal).toBeVisible();

        const textarea = modal.locator('textarea');
        await expect(textarea).toBeVisible();
        await expect(textarea).toHaveValue('');
    });

    test('Save button is disabled when no note text exists and no changes have been made', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);

        const modal = noteModal(page);
        await expect(modal).toBeVisible();

        const saveButton = modal.locator('button', { hasText: 'Zapisz' });
        await expect(saveButton).toBeDisabled();
    });

    test('Save button becomes enabled after typing a note', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);

        const modal = noteModal(page);
        await expect(modal).toBeVisible();

        const saveButton = modal.locator('button', { hasText: 'Zapisz' });
        await expect(saveButton).toBeDisabled();

        await modal.locator('textarea').fill('My test note');

        await expect(saveButton).toBeEnabled();
    });

    test('user can type a note and save it — modal closes on save', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);

        const modal = noteModal(page);
        await expect(modal).toBeVisible();

        await modal.locator('textarea').fill('A test note for room 3');
        await modal.locator('button', { hasText: 'Zapisz' }).click();

        await expect(modal).not.toBeVisible();
    });

    test('saved note persists — reopening the modal shows the previously saved note', async ({ page }) => {
        // Save a note
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();
        await modal.locator('textarea').fill('Persistent note content');
        await modal.locator('button', { hasText: 'Zapisz' }).click();
        await expect(modal).not.toBeVisible();

        // Reopen the modal for the same room
        await openNoteModalViaContextMenu(page, ROOM_ID);
        await expect(modal).toBeVisible();
        await expect(modal.locator('textarea')).toHaveValue('Persistent note content');
    });

    test('saved note is stored in IndexedDB', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();
        await modal.locator('textarea').fill('Stored in db');
        await modal.locator('button', { hasText: 'Zapisz' }).click();
        await expect(modal).not.toBeVisible();

        const savedText = await readNote(page, ROOM_ID);
        expect(savedText).toBe('Stored in db');
    });

    test('Cancel button closes modal without saving', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();

        await modal.locator('textarea').fill('Draft that should not be saved');
        await modal.locator('button', { hasText: 'Anuluj' }).click();

        await expect(modal).not.toBeVisible();

        // Verify nothing was saved
        const savedText = await readNote(page, ROOM_ID);
        expect(savedText).toBeNull();
    });

    test('closing the modal with the X button does not save changes', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();

        await modal.locator('textarea').fill('Unsaved draft');

        // Bootstrap modal close button
        await modal.locator('.btn-close').click();
        await expect(modal).not.toBeVisible();

        const savedText = await readNote(page, ROOM_ID);
        expect(savedText).toBeNull();
    });

    test('Delete button is not visible when no note exists for the room', async ({ page }) => {
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();

        const deleteButton = modal.locator('button', { hasText: 'Usun' });
        await expect(deleteButton).not.toBeVisible();
    });

    test('Delete button is visible when a note exists for the room', async ({ page }) => {
        // Save a note first
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();
        await modal.locator('textarea').fill('Note to be deleted');
        await modal.locator('button', { hasText: 'Zapisz' }).click();
        await expect(modal).not.toBeVisible();

        // Reopen — Delete button should now be present
        await openNoteModalViaContextMenu(page, ROOM_ID);
        await expect(modal).toBeVisible();
        const deleteButton = modal.locator('button', { hasText: 'Usun' });
        await expect(deleteButton).toBeVisible();
    });

    test('Delete button removes the note and closes the modal', async ({ page }) => {
        // First save a note
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();
        await modal.locator('textarea').fill('Note to delete');
        await modal.locator('button', { hasText: 'Zapisz' }).click();
        await expect(modal).not.toBeVisible();

        // Reopen and delete
        await openNoteModalViaContextMenu(page, ROOM_ID);
        await expect(modal).toBeVisible();
        await modal.locator('button', { hasText: 'Usun' }).click();
        await expect(modal).not.toBeVisible();

        // Verify note is gone from IndexedDB
        const savedText = await readNote(page, ROOM_ID);
        expect(savedText).toBeNull();
    });

    test('after deleting a note, reopening shows an empty textarea with no Delete button', async ({ page }) => {
        // Save and then delete a note
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();
        await modal.locator('textarea').fill('Temporary note');
        await modal.locator('button', { hasText: 'Zapisz' }).click();
        await expect(modal).not.toBeVisible();

        await openNoteModalViaContextMenu(page, ROOM_ID);
        await expect(modal).toBeVisible();
        await modal.locator('button', { hasText: 'Usun' }).click();
        await expect(modal).not.toBeVisible();

        // Reopen after deletion
        await openNoteModalViaContextMenu(page, ROOM_ID);
        await expect(modal).toBeVisible();
        await expect(modal.locator('textarea')).toHaveValue('');
        await expect(modal.locator('button', { hasText: 'Usun' })).not.toBeVisible();
    });

    test('Save button is enabled when reopening a room that already has a note', async ({ page }) => {
        // Save a note
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();
        await modal.locator('textarea').fill('Existing note');
        await modal.locator('button', { hasText: 'Zapisz' }).click();
        await expect(modal).not.toBeVisible();

        // Reopen — Save is enabled because noteText is non-empty (allows re-saving same content)
        await openNoteModalViaContextMenu(page, ROOM_ID);
        await expect(modal).toBeVisible();
        const saveButton = modal.locator('button', { hasText: 'Zapisz' });
        await expect(saveButton).toBeEnabled();
    });

    test('Save button is disabled only when both note is empty and no changes exist', async ({ page }) => {
        // No note exists — empty textarea, no changes → Save is disabled
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();
        const saveButton = modal.locator('button', { hasText: 'Zapisz' });
        await expect(saveButton).toBeDisabled();
    });

    test('notes for different rooms are saved and retrieved independently', async ({ page }) => {
        const ROOM_ID_B = 4; // "Rezydencja Borgafa" in "Miasteczko Poslan"
        await clearNote(page, ROOM_ID_B);

        // Save a note for ROOM_ID
        await openNoteModalViaContextMenu(page, ROOM_ID);
        const modal = noteModal(page);
        await expect(modal).toBeVisible();
        await modal.locator('textarea').fill('Note for room 3');
        await modal.locator('button', { hasText: 'Zapisz' }).click();
        await expect(modal).not.toBeVisible();

        // Save a different note for ROOM_ID_B
        await openNoteModalViaContextMenu(page, ROOM_ID_B);
        await expect(modal).toBeVisible();
        const textarea = modal.locator('textarea');
        await expect(textarea).toHaveValue('');
        await textarea.fill('Note for room 4');
        const saveButton = modal.locator('button', { hasText: 'Zapisz' });
        await expect(saveButton).toBeEnabled({ timeout: 5000 });
        await saveButton.click();
        await expect(modal).not.toBeVisible();

        // Verify each room retains its own note
        const noteA = await readNote(page, ROOM_ID);
        const noteB = await readNote(page, ROOM_ID_B);
        expect(noteA).toBe('Note for room 3');
        expect(noteB).toBe('Note for room 4');

        await clearNote(page, ROOM_ID_B);
    });
});

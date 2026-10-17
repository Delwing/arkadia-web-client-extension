import eventBus from "@modules/core/eventBus";

export interface LocationNote {
    id: number;
    note: string;
    roomName?: string;
    areaName?: string;
    updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ArkadiaLocationNotesDB', 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('notes')) {
                db.createObjectStore('notes', { keyPath: 'id' });
            }
        };
        request.onerror = () => reject(new Error('Failed to open IndexedDB'));
        request.onsuccess = () => resolve(request.result);
    });
}

export async function saveNote(note: LocationNote): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['notes'], 'readwrite');
        const store = tx.objectStore('notes');
        const req = store.put(note);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('Failed to store note'));
    });
    eventBus.emit('locationNote.changed', { roomId: note.id });
}

export async function getNote(roomId: number): Promise<LocationNote | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['notes'], 'readonly');
        const store = tx.objectStore('notes');
        const req = store.get(roomId);
        req.onsuccess = () => {
            resolve(req.result ? (req.result as LocationNote) : null);
        };
        req.onerror = () => reject(new Error('Failed to read note'));
    });
}

export async function deleteNote(roomId: number): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['notes'], 'readwrite');
        const store = tx.objectStore('notes');
        const req = store.delete(roomId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('Failed to delete note'));
    });
    eventBus.emit('locationNote.changed', { roomId });
}

export async function getAllNotes(): Promise<LocationNote[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['notes'], 'readonly');
        const store = tx.objectStore('notes');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as LocationNote[]);
        req.onerror = () => reject(new Error('Failed to list notes'));
    });
}

export async function searchNotes(query: string): Promise<LocationNote[]> {
    const allNotes = await getAllNotes();
    const lowerQuery = query.toLowerCase();

    return allNotes.filter(note =>
        note.note.toLowerCase().includes(lowerQuery) ||
        (note.roomName?.toLowerCase().includes(lowerQuery)) ||
        (note.areaName?.toLowerCase().includes(lowerQuery)) ||
        String(note.id).includes(query)
    );
}

export async function exportNotes(): Promise<LocationNote[]> {
    return getAllNotes();
}

/**
 * Make the store hold exactly `notes` (sync apply): notes missing from the list
 * are deleted, so a deletion on another device propagates. Emits
 * locationNote.changed for every room whose note was added, changed or removed.
 */
export async function replaceAllNotes(notes: LocationNote[]): Promise<void> {
    if (!Array.isArray(notes)) return;
    const existing = new Map((await getAllNotes()).map(note => [note.id, note]));
    const incoming = new Map(notes.map(note => [note.id, note]));
    const changed = new Set<number>();
    for (const id of existing.keys()) {
        if (!incoming.has(id)) changed.add(id);
    }
    for (const [id, note] of incoming) {
        if (JSON.stringify(existing.get(id)) !== JSON.stringify(note)) changed.add(id);
    }
    if (changed.size === 0) return;

    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['notes'], 'readwrite');
        const store = tx.objectStore('notes');
        for (const id of changed) {
            const note = incoming.get(id);
            if (note) store.put(note);
            else store.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Failed to replace notes'));
    });
    for (const roomId of changed) {
        eventBus.emit('locationNote.changed', { roomId });
    }
}

export async function importNotes(notes: LocationNote[]): Promise<void> {
    if (!Array.isArray(notes)) return;
    if (notes.length === 0) return;
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['notes'], 'readwrite');
        const store = tx.objectStore('notes');
        notes.forEach(note => {
            store.put(note);
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Failed to import notes'));
    });
}

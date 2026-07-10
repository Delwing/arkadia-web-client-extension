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

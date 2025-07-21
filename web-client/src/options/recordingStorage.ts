export interface RecordedEvent {
    message: string;
    timestamp: number;
    direction: 'in' | 'out';
}

function isIndexedDBSupported() {
    return 'indexedDB' in window;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (!isIndexedDBSupported()) {
            reject(new Error('IndexedDB is not supported'));
            return;
        }
        const request = indexedDB.open('ArkadiaRecordingsDB', 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('recordings')) {
                db.createObjectStore('recordings', { keyPath: 'id' });
            }
        };
        request.onerror = () => reject(new Error('Failed to open IndexedDB'));
        request.onsuccess = () => resolve(request.result);
    });
}

export async function saveRecording(id: string, events: RecordedEvent[]): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['recordings'], 'readwrite');
        const store = tx.objectStore('recordings');
        const req = store.put({ id, events });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('Failed to store recording'));
    });
}

export async function getRecording(id: string): Promise<RecordedEvent[] | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['recordings'], 'readonly');
        const store = tx.objectStore('recordings');
        const req = store.get(id);
        req.onsuccess = () => {
            resolve(req.result ? (req.result.events as RecordedEvent[]) : null);
        };
        req.onerror = () => reject(new Error('Failed to read recording'));
    });
}

export async function getRecordingNames(): Promise<string[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['recordings'], 'readonly');
        const store = tx.objectStore('recordings');
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => reject(new Error('Failed to list recordings'));
    });
}

export async function deleteRecording(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['recordings'], 'readwrite');
        const store = tx.objectStore('recordings');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('Failed to delete recording'));
    });
}

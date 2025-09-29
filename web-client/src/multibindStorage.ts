export const MULTIBIND_DB = {
    dbName: 'ArkadiaMultibindsDB',
    storeName: 'multibinds',
    keyPath: 'key',
} as const;

export interface StoredMultibindRecord {
    roomId: number;
    index: number;
    action: string;
}

function normalizeEntry(entry: any): StoredMultibindRecord | null {
    const roomId = Number(entry?.roomId);
    const index = Number(entry?.index);
    if (!Number.isFinite(roomId) || !Number.isFinite(index)) {
        return null;
    }
    return {
        roomId,
        index,
        action: typeof entry?.action === 'string' ? entry.action : String(entry?.action ?? ''),
    };
}

export function openMultibindDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(MULTIBIND_DB.dbName, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(MULTIBIND_DB.storeName)) {
                const store = db.createObjectStore(MULTIBIND_DB.storeName, { keyPath: MULTIBIND_DB.keyPath });
                store.createIndex('roomId', 'roomId', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to open multibinds IndexedDB'));
    });
}

export async function readMultibinds(): Promise<StoredMultibindRecord[]> {
    try {
        const db = await openMultibindDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([MULTIBIND_DB.storeName], 'readonly');
            const store = tx.objectStore(MULTIBIND_DB.storeName);
            const req = store.getAll();
            req.onsuccess = () => {
                const result = Array.isArray(req.result) ? req.result : [];
                const normalized: StoredMultibindRecord[] = [];
                result.forEach(item => {
                    const entry = normalizeEntry(item);
                    if (entry) {
                        normalized.push(entry);
                    }
                });
                resolve(normalized);
            };
            req.onerror = () => reject(new Error('Failed to read multibinds data'));
        });
    } catch {
        return [];
    }
}

export async function replaceMultibinds(list: StoredMultibindRecord[]): Promise<StoredMultibindRecord[]> {
    const db = await openMultibindDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([MULTIBIND_DB.storeName], 'readwrite');
        const store = tx.objectStore(MULTIBIND_DB.storeName);
        const normalized: StoredMultibindRecord[] = [];
        const clearReq = store.clear();
        clearReq.onerror = () => reject(new Error('Failed to clear multibinds'));
        clearReq.onsuccess = () => {
            (Array.isArray(list) ? list : []).forEach(item => {
                const entry = normalizeEntry(item);
                if (!entry) {
                    return;
                }
                const key = `${entry.roomId}:${entry.index}`;
                store.put({
                    [MULTIBIND_DB.keyPath]: key,
                    roomId: entry.roomId,
                    index: entry.index,
                    action: entry.action,
                });
                normalized.push({ ...entry });
            });
        };
        tx.oncomplete = () => resolve(normalized);
        tx.onerror = () => reject(new Error('Failed to store multibinds'));
    });
}

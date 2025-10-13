import storage, { setItemSync, getItemSync } from "@client/src/storage";
import { readMultibinds, replaceMultibinds } from "./multibindStorage";

const DB_CONFIG = { dbName: 'ArkadiaNpcDB', storeName: 'npcData', key: 'npc' } as const;

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_CONFIG.dbName, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DB_CONFIG.storeName)) {
                db.createObjectStore(DB_CONFIG.storeName, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    });
}

async function getNpcs(): Promise<any[]> {
    try {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([DB_CONFIG.storeName], 'readonly');
            const store = tx.objectStore(DB_CONFIG.storeName);
            const req = store.get(DB_CONFIG.key);
            req.onsuccess = () => {
                resolve(req.result ? req.result.data : []);
            };
            req.onerror = () => reject(new Error('Failed to read data'));
        });
    } catch {
        return [];
    }
}

async function saveNpcs(list: any[]) {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction([DB_CONFIG.storeName], 'readwrite');
        const store = tx.objectStore(DB_CONFIG.storeName);
        const req = store.put({ id: DB_CONFIG.key, data: list, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('Failed to store data'));
    });
}

export default class MockPort {
    listeners: Array<(msg: any) => void> = [];
    onMessage = {
        addListener: (cb: (msg: any) => void) => {
            console.warn('Add listener called');
        }
    };

    private dispatch(message: any) {
        console.warn('Add listener called');
    }

    postMessage(message: any) {
        console.warn('Post message called');
    }

    private sendStorage(key: string) {
      console.warn('Send storage called with key:', key);
    };
}

import storage, { setItemSync, getItemSync } from "@client/src/storage";

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
            this.listeners.push(cb);
        }
    };

    constructor() {
        storage.onChanged?.addListener(changes => {
            Object.entries(changes).forEach(([key, {newValue}]) => {
                this.dispatch({storage: {key, value: newValue}});
                if (key === 'settings' || key === 'npc' || key === 'uiSettings') {
                    this.dispatch({[key]: newValue});
                }
            });
        });
    }

    private dispatch(message: any) {
        this.listeners.forEach(l => l(message));
    }

    postMessage(message: any) {
        if (message.type === 'NEW_NPC') {
            getNpcs().then(async npc => {
                npc = Array.isArray(npc) ? npc : [];
                if (!npc.some((n: any) => n.name === message.name && n.loc === message.loc)) {
                    npc.push({ name: message.name, loc: message.loc });
                    await saveNpcs(npc);
                }
                this.dispatch({ npc });
                this.dispatch({ storage: { key: 'npc', value: npc } });
            }).catch(e => console.error('Failed to add NPC:', e));
            return;
        }
        if (message.type === 'SET_STORAGE') {
            setItemSync(message.key, message.value);
            this.dispatch({storage: {key: message.key, value: message.value}});
            if (message.key === 'settings' || message.key === 'npc' || message.key === 'uiSettings') {
                this.dispatch({[message.key]: message.value});
            }
        }
        if (message.type === 'GET_STORAGE') {
            this.sendStorage(message.key);
        }
    }

    private sendStorage(key: string) {
        const data = getItemSync(key);
        const value = data ? data[key] : null;
        this.dispatch({ storage: { key, value } });
        if (key === 'settings' || key === 'npc' || key === 'uiSettings') {
            this.dispatch({ [key]: value });
        }
    };
}

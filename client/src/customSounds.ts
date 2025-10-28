import storage from "./storage";

export const CUSTOM_SOUNDS_STORAGE_KEY = "custom_sounds";

const DB_NAME = "ArkadiaCustomSounds";
const STORE_NAME = "sounds";

export interface CustomSound {
    key: string;
    name: string;
    data: string;
}

interface StoredCustomSound {
    key: string;
    name: string;
    data?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function normalizeStoredSound(value: unknown): StoredCustomSound | null {
    if (!value || typeof value !== "object") {
        return null;
    }
    const key = (value as any).key;
    const name = (value as any).name;
    const data = (value as any).data;
    if (typeof key !== "string" || typeof name !== "string") {
        return null;
    }
    const sound: StoredCustomSound = { key, name };
    if (typeof data === "string") {
        sound.data = data;
    }
    return sound;
}

function normalizeStoredSoundList(value: unknown): StoredCustomSound[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set<string>();
    const result: StoredCustomSound[] = [];
    for (const item of value) {
        const normalized = normalizeStoredSound(item);
        if (!normalized || seen.has(normalized.key)) {
            continue;
        }
        seen.add(normalized.key);
        result.push(normalized);
    }
    return result;
}

async function readStoredSounds(): Promise<StoredCustomSound[]> {
    const result = await storage.getItem(CUSTOM_SOUNDS_STORAGE_KEY);
    if (!result) {
        return [];
    }
    return normalizeStoredSoundList((result as any)[CUSTOM_SOUNDS_STORAGE_KEY]);
}

async function ensureDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
        throw new Error("IndexedDB is not available");
    }
    if (!dbPromise) {
        dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "key" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error("Failed to open custom sound database"));
        }).catch(error => {
            dbPromise = null;
            throw error;
        });
    }
    return dbPromise;
}

async function saveSoundData(key: string, data: string): Promise<void> {
    const db = await ensureDatabase();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.onabort = () => reject(tx.error ?? new Error("Failed to store custom sound"));
        tx.onerror = () => reject(tx.error ?? new Error("Failed to store custom sound"));
        tx.oncomplete = () => resolve();
        const store = tx.objectStore(STORE_NAME);
        store.put({ key, data, updatedAt: Date.now() });
    });
}

async function getSoundData(key: string): Promise<string | undefined> {
    try {
        const db = await ensureDatabase();
        return await new Promise<string | undefined>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            tx.onabort = () => reject(tx.error ?? new Error("Failed to read custom sound"));
            tx.onerror = () => reject(tx.error ?? new Error("Failed to read custom sound"));
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => {
                const value = request.result;
                resolve(typeof value?.data === "string" ? value.data : undefined);
            };
            request.onerror = () => reject(request.error ?? new Error("Failed to read custom sound"));
        });
    } catch (error) {
        if ((error as Error).message === "IndexedDB is not available") {
            return undefined;
        }
        console.warn("Failed to get custom sound from IndexedDB", error);
        return undefined;
    }
}

async function deleteSoundData(key: string): Promise<void> {
    try {
        const db = await ensureDatabase();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.onabort = () => reject(tx.error ?? new Error("Failed to remove custom sound"));
            tx.onerror = () => reject(tx.error ?? new Error("Failed to remove custom sound"));
            tx.oncomplete = () => resolve();
            const store = tx.objectStore(STORE_NAME);
            store.delete(key);
        });
    } catch (error) {
        if ((error as Error).message !== "IndexedDB is not available") {
            console.warn("Failed to delete custom sound from IndexedDB", error);
        }
    }
}

function normalizeCustomSoundList(list: CustomSound[]): CustomSound[] {
    if (!Array.isArray(list)) {
        return [];
    }
    const seen = new Set<string>();
    const result: CustomSound[] = [];
    list.forEach(item => {
        if (!item || typeof item !== "object") {
            return;
        }
        const { key, name, data } = item as any;
        if (typeof key !== "string" || typeof name !== "string" || typeof data !== "string") {
            return;
        }
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        result.push({ key, name, data });
    });
    return result;
}

async function ensureSoundDataAvailability(sound: StoredCustomSound): Promise<{ data?: string; sanitized: StoredCustomSound }> {
    let data = typeof sound.data === "string" ? sound.data : undefined;
    if (data) {
        try {
            await saveSoundData(sound.key, data);
            return { data, sanitized: { key: sound.key, name: sound.name } };
        } catch (error) {
            console.warn("Failed to persist custom sound in IndexedDB", error);
            return { data, sanitized: sound };
        }
    }
    const stored = await getSoundData(sound.key);
    return { data: stored, sanitized: sound };
}

export async function getCustomSounds(): Promise<CustomSound[]> {
    const stored = await readStoredSounds();
    const sanitized: StoredCustomSound[] = [];
    const result: CustomSound[] = [];
    let metadataChanged = false;

    for (const sound of stored) {
        const { data, sanitized: sanitizedEntry } = await ensureSoundDataAvailability(sound);
        sanitized.push(sanitizedEntry);
        if (sanitizedEntry !== sound) {
            metadataChanged = true;
        }
        if (typeof data === "string") {
            result.push({ key: sound.key, name: sound.name, data });
        }
    }

    if (metadataChanged) {
        await storage.setItem(CUSTOM_SOUNDS_STORAGE_KEY, sanitized);
    }

    return result;
}

export async function getCustomSound(key: string): Promise<CustomSound | undefined> {
    const stored = await readStoredSounds();
    const index = stored.findIndex(sound => sound.key === key);
    if (index === -1) {
        return undefined;
    }
    const sound = stored[index];
    const { data, sanitized } = await ensureSoundDataAvailability(sound);
    if (sanitized !== sound) {
        const updated = [...stored];
        updated[index] = sanitized;
        await storage.setItem(CUSTOM_SOUNDS_STORAGE_KEY, updated);
    }
    if (typeof data !== "string") {
        return undefined;
    }
    return { key: sound.key, name: sound.name, data };
}

export async function saveCustomSounds(sounds: CustomSound[]): Promise<void> {
    const normalized = normalizeCustomSoundList(sounds);
    const existing = await readStoredSounds();
    const existingKeys = new Set(existing.map(sound => sound.key));

    const toStore: StoredCustomSound[] = [];
    for (const sound of normalized) {
        existingKeys.delete(sound.key);
        try {
            await saveSoundData(sound.key, sound.data);
            toStore.push({ key: sound.key, name: sound.name });
        } catch (error) {
            console.warn("Failed to persist custom sound in IndexedDB", error);
            toStore.push({ key: sound.key, name: sound.name, data: sound.data });
        }
    }

    await storage.setItem(CUSTOM_SOUNDS_STORAGE_KEY, toStore);

    for (const key of existingKeys) {
        await deleteSoundData(key);
    }
}

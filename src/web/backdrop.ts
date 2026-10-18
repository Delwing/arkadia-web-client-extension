/**
 * The page backdrop: an image behind the whole page - the theme's own
 * (Kuźnia's stone), none, or one the player uploaded. The output turns
 * see-through over it, so it shows under the game text and, in a theme that
 * stands its windows apart, between them.
 *
 * An uploaded image lives in IndexedDB on this device only (it is not part of
 * settings sync, like an uploaded font); the settings keep just the choice.
 * <body> shows it through `--backdrop-image` and the `data-backdrop`
 * attribute style.css keys on, shaded by `--backdrop-shade` so the text
 * stays legible. A choice that has no image here (a theme without one, no
 * file on this device) leaves the plain output background colour.
 */
import type { BackgroundImage } from '@shared/uiSettingsTypes';

export interface StoredBackdrop {
    fileName: string;
    blob: Blob;
}

const DB_NAME = 'ArkadiaCustomImages';
const STORE_NAME = 'files';
const KEY = 'output';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('IndexedDB is not available'));
    }
    if (!dbPromise) {
        dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('Failed to open the image database'));
        }).catch(error => {
            dbPromise = null;
            throw error;
        });
    }
    return dbPromise;
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return openDatabase().then(db => new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Image database request failed'));
    }));
}

export async function getUploadedBackdrop(): Promise<StoredBackdrop | null> {
    try {
        const stored = await request<StoredBackdrop | undefined>('readonly', store => store.get(KEY));
        return stored && stored.blob instanceof Blob ? stored : null;
    } catch {
        return null;
    }
}

let objectUrl: string | null = null;
let objectUrlFor: Blob | null = null;

function urlOf(blob: Blob): string {
    if (objectUrlFor !== blob) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob);
        objectUrlFor = blob;
    }
    return objectUrl!;
}

// The last call's choice, so storing or clearing the file shows at once.
let last: { mode: BackgroundImage; shade: number } | null = null;
let generation = 0;

export async function storeBackdrop(file: File): Promise<StoredBackdrop> {
    const stored: StoredBackdrop = { fileName: file.name, blob: file };
    await request('readwrite', store => store.put(stored, KEY));
    if (last) applyBackdrop(last.mode, last.shade);
    return stored;
}

export async function clearBackdrop(): Promise<void> {
    await request('readwrite', store => store.delete(KEY));
    if (last) applyBackdrop(last.mode, last.shade);
}

function show(image: string | null): void {
    const body = document.body;
    if (image) {
        body.style.setProperty('--backdrop-image', image);
        body.dataset.backdrop = '';
    } else {
        body.style.removeProperty('--backdrop-image');
        delete body.dataset.backdrop;
    }
}

/** Lays the chosen image behind the page, shaded by `shade` percent. */
export function applyBackdrop(mode: BackgroundImage, shade: number): void {
    last = { mode, shade };
    const current = ++generation;
    document.body.style.setProperty('--backdrop-shade', String(shade / 100));
    if (mode === 'theme') {
        // The theme's class is on <body> by now; a theme without an image leaves the colour.
        const themed = getComputedStyle(document.body).getPropertyValue('--theme-backdrop').trim();
        show(themed && themed !== 'none' ? 'var(--theme-backdrop)' : null);
    } else if (mode === 'uploaded') {
        void getUploadedBackdrop().then(stored => {
            if (current !== generation) return;
            show(stored ? `url("${urlOf(stored.blob)}")` : null);
        });
    } else {
        show(null);
    }
}

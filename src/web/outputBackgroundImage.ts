/**
 * The image under the game output: the theme's own (Kuźnia's stone), none,
 * or one the player uploaded.
 *
 * An uploaded image lives in IndexedDB on this device only (it is not part of
 * settings sync, like an uploaded font); the settings keep just the choice.
 * The output shows it through `--output-image` and the `data-output-image`
 * attribute style.css keys on, shaded by `--output-image-shade` so the text
 * stays legible. A choice that has no image here (a theme without one, no
 * file on this device) leaves the plain background colour.
 */
import type { OutputBackgroundImage } from '@shared/uiSettingsTypes';

export interface StoredOutputImage {
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

export async function getUploadedOutputImage(): Promise<StoredOutputImage | null> {
    try {
        const stored = await request<StoredOutputImage | undefined>('readonly', store => store.get(KEY));
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

// The last call's target and choice, so storing or clearing the file shows at once.
let last: { target: HTMLElement; mode: OutputBackgroundImage; shade: number } | null = null;
let generation = 0;

export async function storeOutputImage(file: File): Promise<StoredOutputImage> {
    const stored: StoredOutputImage = { fileName: file.name, blob: file };
    await request('readwrite', store => store.put(stored, KEY));
    if (last) applyOutputBackgroundImage(last.target, last.mode, last.shade);
    return stored;
}

export async function clearOutputImage(): Promise<void> {
    await request('readwrite', store => store.delete(KEY));
    if (last) applyOutputBackgroundImage(last.target, last.mode, last.shade);
}

function show(target: HTMLElement, image: string | null): void {
    if (image) {
        target.style.setProperty('--output-image', image);
        target.dataset.outputImage = '';
    } else {
        target.style.removeProperty('--output-image');
        delete target.dataset.outputImage;
    }
}

/** Puts the chosen image under `target` (the output), shaded by `shade` percent. */
export function applyOutputBackgroundImage(target: HTMLElement, mode: OutputBackgroundImage, shade: number): void {
    last = { target, mode, shade };
    const current = ++generation;
    target.style.setProperty('--output-image-shade', String(shade / 100));
    if (mode === 'theme') {
        // The theme's class is on <body> by now; a theme without an image leaves the colour.
        const themed = getComputedStyle(document.body).getPropertyValue('--theme-output-image').trim();
        show(target, themed && themed !== 'none' ? 'var(--theme-output-image)' : null);
    } else if (mode === 'uploaded') {
        void getUploadedOutputImage().then(stored => {
            if (current !== generation) return;
            show(target, stored ? `url("${urlOf(stored.blob)}")` : null);
        });
    } else {
        show(target, null);
    }
}

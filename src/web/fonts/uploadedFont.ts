/**
 * A font the player uploaded from their own files.
 *
 * One family at a time, in up to four slots - the only faces the output
 * uses. The files live in IndexedDB on this device only (they are not part of
 * settings sync); the settings keep just the family name, which doubles as a
 * fallback to an installed copy on devices without the files.
 *
 * The faces are published as an `@font-face` <style> in <head> with blob: URLs,
 * so popped-out windows pick them up through the head-style mirror.
 */
import { isFontFileName, readFontFileInfo, type FontFileFormat } from './fontFileInfo';

export type FontSlot = 'regular' | 'bold' | 'italic' | 'boldItalic';

export const FONT_SLOTS: FontSlot[] = ['regular', 'bold', 'italic', 'boldItalic'];

/** Internal family the faces are registered under, so they never clash with an installed font. */
export const UPLOADED_FONT_FACE_FAMILY = 'Arkadia Uploaded Font';

export interface StoredFontFile {
    slot: FontSlot;
    fileName: string;
    family: string;
    weight: number;
    weightRange?: [number, number];
    italic: boolean;
    format: FontFileFormat;
    fromFile: boolean;
    data: ArrayBuffer;
}

export interface FontUploadResult {
    /** Files now stored, after the upload. */
    files: StoredFontFile[];
    family: string;
    /** Files left out: a different family, an extra weight, or not a font. */
    skipped: string[];
}

const DB_NAME = 'ArkadiaCustomFonts';
const STORE_NAME = 'files';

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
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'slot' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('Failed to open the font database'));
        }).catch(error => {
            dbPromise = null;
            throw error;
        });
    }
    return dbPromise;
}

function transaction(mode: IDBTransactionMode, run: (store: IDBObjectStore) => void): Promise<void> {
    return openDatabase().then(db => new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Font database transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('Font database transaction aborted'));
        run(tx.objectStore(STORE_NAME));
    }));
}

function isSlot(value: unknown): value is FontSlot {
    return FONT_SLOTS.includes(value as FontSlot);
}

export async function getUploadedFontFiles(): Promise<StoredFontFile[]> {
    let rows: unknown[] = [];
    try {
        await transaction('readonly', store => {
            const request = store.getAll();
            request.onsuccess = () => { rows = request.result; };
        });
    } catch (error) {
        if ((error as Error).message !== 'IndexedDB is not available') {
            console.warn('Failed to read uploaded fonts', error);
        }
        return [];
    }
    return rows
        .filter((r): r is StoredFontFile => !!r && typeof r === 'object' && isSlot((r as StoredFontFile).slot) && Object.prototype.toString.call((r as StoredFontFile).data) === "[object ArrayBuffer]")
        .sort((a, b) => FONT_SLOTS.indexOf(a.slot) - FONT_SLOTS.indexOf(b.slot));
}

/**
 * The slot a face fills. Static weights round to the nearer of regular and
 * bold; a variable font spanning 400 sits in the regular (or italic) slot.
 */
export function slotFor(weight: number, italic: boolean, weightRange?: [number, number]): FontSlot {
    const bold = weightRange && weightRange[0] <= 400 && weightRange[1] >= 400 ? false : weight >= 600;
    if (italic) return bold ? 'boldItalic' : 'italic';
    return bold ? 'bold' : 'regular';
}

const SLOT_WEIGHT: Record<FontSlot, number> = { regular: 400, bold: 700, italic: 400, boldItalic: 700 };

/** Slots a stored file covers: a variable font spanning 400-700 fills both weights. */
export function slotsCovered(file: Pick<StoredFontFile, 'slot' | 'weightRange'>): FontSlot[] {
    const range = file.weightRange;
    if (range && range[0] <= 400 && range[1] >= 700) {
        return file.slot === 'italic' || file.slot === 'boldItalic' ? ['italic', 'boldItalic'] : ['regular', 'bold'];
    }
    return [file.slot];
}

type Candidate = Omit<StoredFontFile, 'slot'> & { slot: FontSlot };

/** How far a face is from the slot's ideal weight; variable fonts covering it are a perfect fit. */
function distance(c: Candidate, slot: FontSlot): number {
    const target = SLOT_WEIGHT[slot];
    if (c.weightRange && c.weightRange[0] <= target && c.weightRange[1] >= target) return 0;
    return Math.abs(c.weight - target);
}

/**
 * Picks which of the new files fill which slot, merged with what is stored.
 * Pure, so the rules are testable without IndexedDB.
 *
 * - Files of the family most of the batch belongs to win; the rest are skipped.
 * - A different family than the stored one replaces the stored font entirely.
 * - Per slot the face nearest 400 / 700 wins (Regular over Light, Bold over Black).
 */
export function mergeFontFiles(stored: StoredFontFile[], incoming: Candidate[]): { files: StoredFontFile[]; family: string; skipped: string[] } {
    const skipped: string[] = [];
    const counts = new Map<string, number>();
    for (const c of incoming) counts.set(c.family, (counts.get(c.family) ?? 0) + 1);
    const storedFamily = stored[0]?.family;
    let family = storedFamily ?? '';
    let best = -1;
    for (const [name, count] of counts) {
        const score = count * 2 + (name === storedFamily ? 1 : 0);
        if (score > best) {
            best = score;
            family = name;
        }
    }
    const sameFamily: Candidate[] = [];
    for (const c of incoming) {
        if (c.family === family) sameFamily.push(c);
        else skipped.push(c.fileName);
    }

    const result = new Map<FontSlot, StoredFontFile>();
    if (storedFamily === family) {
        for (const f of stored) result.set(f.slot, f);
    }
    const chosen = new Map<FontSlot, Candidate>();
    for (const c of sameFamily) {
        const current = chosen.get(c.slot);
        if (!current || distance(c, c.slot) < distance(current, c.slot)) {
            if (current) skipped.push(current.fileName);
            chosen.set(c.slot, c);
        } else {
            skipped.push(c.fileName);
        }
    }
    for (const [slot, c] of chosen) {
        result.set(slot, c);
        // A variable font takes over the bold slot it also covers.
        for (const covered of slotsCovered(c)) {
            if (covered !== slot && result.get(covered) && !chosen.has(covered)) result.delete(covered);
        }
    }
    const files = FONT_SLOTS.map(s => result.get(s)).filter((f): f is StoredFontFile => !!f);
    return { files, family, skipped };
}

/**
 * Stores the font files among `fileList`. With `slot`, a single file goes into
 * that slot of the stored family whatever it says about itself - the way to
 * correct a guess from a file name.
 */
export async function uploadFontFiles(fileList: Iterable<File>, slot?: FontSlot): Promise<FontUploadResult> {
    const skipped: string[] = [];
    const incoming: Candidate[] = [];
    const stored = await getUploadedFontFiles();
    for (const file of fileList) {
        if (!isFontFileName(file.name) || (slot && incoming.length > 0)) {
            skipped.push(file.name);
            continue;
        }
        const data = await file.arrayBuffer();
        const info = await readFontFileInfo(data, file.name);
        const candidate: Candidate = { ...info, fileName: file.name, data, slot: slotFor(info.weight, info.italic, info.weightRange) };
        if (slot) {
            candidate.slot = slot;
            candidate.family = stored[0]?.family ?? info.family;
            if (!candidate.weightRange) candidate.weight = SLOT_WEIGHT[slot];
        }
        incoming.push(candidate);
    }
    if (incoming.length === 0) {
        return { files: stored, family: stored[0]?.family ?? '', skipped };
    }
    const merged = mergeFontFiles(stored, incoming);
    await transaction('readwrite', store => {
        store.clear();
        for (const f of merged.files) store.put(f);
    });
    await refreshUploadedFontFaces();
    return { files: merged.files, family: merged.family, skipped: [...skipped, ...merged.skipped] };
}

export async function removeUploadedFontSlot(slot: FontSlot): Promise<StoredFontFile[]> {
    await transaction('readwrite', store => { store.delete(slot); });
    await refreshUploadedFontFaces();
    return getUploadedFontFiles();
}

export async function clearUploadedFont(): Promise<void> {
    await transaction('readwrite', store => { store.clear(); });
    await refreshUploadedFontFaces();
}

// --- @font-face publishing -------------------------------------------------

const STYLE_ATTR = 'data-uploaded-font';
let blobUrls: string[] = [];
let wanted = false;
let generation = 0;

const CSS_FORMAT: Record<FontFileFormat, string> = {
    truetype: 'truetype',
    opentype: 'opentype',
    collection: 'collection',
    woff: 'woff',
    woff2: 'woff2',
};

function removeFaces(): void {
    document.head.querySelector(`style[${STYLE_ATTR}]`)?.remove();
    for (const url of blobUrls) URL.revokeObjectURL(url);
    blobUrls = [];
}

function faceRule(file: StoredFontFile, url: string): string {
    const range = file.weightRange;
    const weight = range ? `${range[0]} ${range[1]}` : String(SLOT_WEIGHT[file.slot]);
    return `@font-face {
  font-family: "${UPLOADED_FONT_FACE_FAMILY}";
  font-style: ${file.slot === 'italic' || file.slot === 'boldItalic' ? 'italic' : 'normal'};
  font-weight: ${weight};
  font-display: swap;
  src: url("${url}") format("${CSS_FORMAT[file.format]}");
}`;
}

async function publishFaces(): Promise<void> {
    const mine = ++generation;
    const files = await getUploadedFontFiles();
    if (mine !== generation) return;
    removeFaces();
    if (!wanted || files.length === 0) return;
    const rules = files.map(file => {
        const url = URL.createObjectURL(new Blob([file.data]));
        blobUrls.push(url);
        return faceRule(file, url);
    });
    const style = document.createElement('style');
    style.setAttribute(STYLE_ATTR, '');
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
}

/** Publish (or drop) the uploaded faces depending on whether the output uses them. */
export function setUploadedFontActive(active: boolean): void {
    if (typeof document === 'undefined' || active === wanted) return;
    wanted = active;
    if (active) {
        void publishFaces();
    } else {
        generation++;
        removeFaces();
    }
}

/** Re-read the stored files after they changed. */
export async function refreshUploadedFontFaces(): Promise<void> {
    if (typeof document === 'undefined' || !wanted) return;
    await publishFaces();
}

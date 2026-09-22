import type { RecordedEvent } from "@shared/recorder";

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
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

export interface RecordingSummary {
    name: string;
    events: number;
    /** First and last event time; null for an empty recording. */
    start: number | null;
    end: number | null;
    /** Events per slice of the recording's length, for the activity sparkline. */
    activity: number[];
}

const ACTIVITY_SLICES = 40;

export function summarizeRecording(name: string, events: RecordedEvent[]): RecordingSummary {
    const times = events.map(e => e.timestamp).filter((t): t is number => typeof t === 'number');
    if (times.length === 0) {
        return { name, events: events.length, start: null, end: null, activity: [] };
    }
    // A loop, not Math.min(...times): a long session has too many events to spread.
    let start = times[0];
    let end = times[0];
    for (const t of times) {
        if (t < start) start = t;
        if (t > end) end = t;
    }
    const span = Math.max(1, end - start);
    const activity = new Array<number>(ACTIVITY_SLICES).fill(0);
    for (const t of times) {
        activity[Math.min(ACTIVITY_SLICES - 1, Math.floor(((t - start) / span) * ACTIVITY_SLICES))]++;
    }
    return { name, events: events.length, start, end, activity };
}

/** Every saved recording, summarised; the events themselves are not kept. */
export async function getRecordingSummaries(): Promise<RecordingSummary[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['recordings'], 'readonly');
        const req = tx.objectStore('recordings').openCursor();
        const summaries: RecordingSummary[] = [];
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
                resolve(summaries);
                return;
            }
            const value = cursor.value as { id: string; events?: RecordedEvent[] };
            summaries.push(summarizeRecording(value.id, Array.isArray(value.events) ? value.events : []));
            cursor.continue();
        };
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

export type { RecordedEvent } from "@shared/recorder";

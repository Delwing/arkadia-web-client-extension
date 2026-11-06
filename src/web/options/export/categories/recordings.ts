import type { RecordedEvent } from "@web/recordingStorage.ts";
import type { CategoryHandler } from "../categoryHandler";
import { openKeyedStore } from "../indexedDb";

export interface ExportedRecording {
    id: string;
    events: RecordedEvent[];
}

function openRecordingsDb(): Promise<IDBDatabase> {
    return openKeyedStore("ArkadiaRecordingsDB", "recordings", "recordings");
}

export async function exportRecordings(): Promise<ExportedRecording[]> {
    try {
        const db = await openRecordingsDb();
        return await new Promise<ExportedRecording[]>((resolve, reject) => {
            const tx = db.transaction(["recordings"], "readonly");
            const store = tx.objectStore("recordings");
            const req = store.getAll();
            req.onsuccess = () => {
                const list = Array.isArray(req.result) ? req.result : [];
                const result: ExportedRecording[] = list
                    .filter((entry: any) => typeof entry?.id === "string" && Array.isArray(entry?.events))
                    .map((entry: any) => ({
                        id: entry.id as string,
                        events: entry.events as RecordedEvent[],
                    }));
                resolve(result);
            };
            req.onerror = () => reject(new Error("Failed to read recordings"));
        });
    } catch (err) {
        console.error("Failed to export recordings", err);
        return [];
    }
}

/** Replace every stored recording with the given ones. */
export async function importRecordings(records: ExportedRecording[]): Promise<void> {
    const list = Array.isArray(records) ? records : [];
    const db = await openRecordingsDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["recordings"], "readwrite");
        const store = tx.objectStore("recordings");
        const clearReq = store.clear();
        clearReq.onerror = () => reject(new Error("Failed to clear recordings store"));
        clearReq.onsuccess = () => {
            list.forEach(record => {
                store.put({ id: record.id, events: record.events });
            });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("Failed to save recordings"));
    });
}

/** Backup-only category: recordings are never synced. */
export const recordingsCategory: CategoryHandler = {
    async export() {
        const recordings = await exportRecordings();
        return recordings.length > 0 ? JSON.stringify(recordings) : null;
    },
    async import(data) {
        await importRecordings(Array.isArray(data) ? data : []);
    },
};

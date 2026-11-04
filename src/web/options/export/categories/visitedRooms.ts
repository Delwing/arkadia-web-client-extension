import type { CategoryHandler } from "../categoryHandler";
import { openKeyedStore } from "../indexedDb";

export interface ExportedVisitedRoomsEntry {
    id: string;
    rooms: number[];
}

function openVisitedDb(): Promise<IDBDatabase> {
    return openKeyedStore("ArkadiaVisitedRoomsDB", "visitedRooms", "visited rooms");
}

export async function exportVisitedRooms(selectedCharacters: string[]): Promise<ExportedVisitedRoomsEntry[]> {
    try {
        const db = await openVisitedDb();
        return await new Promise<ExportedVisitedRoomsEntry[]>((resolve, reject) => {
            const tx = db.transaction(["visitedRooms"], "readonly");
            const store = tx.objectStore("visitedRooms");
            const req = store.getAll();
            req.onsuccess = () => {
                const selectedSet = new Set(selectedCharacters);
                const result: ExportedVisitedRoomsEntry[] = [];
                const list = Array.isArray(req.result) ? req.result : [];
                list.forEach((entry: any) => {
                    const id = typeof entry?.id === "string" ? entry.id : "";
                    if (!id) return;
                    const idx = id.indexOf(":");
                    if (idx > 0) {
                        const name = id.slice(0, idx);
                        if (!selectedSet.has(name)) {
                            return;
                        }
                    }
                    // Sort for a canonical export — insertion order differs between
                    // devices and would break checksum comparison of identical data.
                    const rooms = Array.isArray(entry?.rooms)
                        ? entry.rooms.filter((v: unknown) => Number.isFinite(v as number)).map((v: number) => Number(v)).sort((a: number, b: number) => a - b)
                        : [];
                    result.push({ id, rooms });
                });
                resolve(result);
            };
            req.onerror = () => reject(new Error("Failed to read visited rooms"));
        });
    } catch (err) {
        console.error("Failed to export visited rooms", err);
        return [];
    }
}

export async function importVisitedRooms(entries: ExportedVisitedRoomsEntry[]): Promise<void> {
    if (!Array.isArray(entries)) return;
    if (entries.length === 0) return;
    const db = await openVisitedDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["visitedRooms"], "readwrite");
        const store = tx.objectStore("visitedRooms");
        entries.forEach(entry => {
            const incoming = Array.isArray(entry.rooms) ? entry.rooms : [];
            // Union with existing rooms — visited rooms are append-only, so an
            // import must never discard rooms visited locally but absent from
            // the imported snapshot (e.g. explored while another device synced).
            const getReq = store.get(entry.id);
            getReq.onsuccess = () => {
                const existing: number[] = Array.isArray(getReq.result?.rooms) ? getReq.result.rooms : [];
                const merged = Array.from(new Set([...existing, ...incoming])).sort((a, b) => a - b);
                store.put({ id: entry.id, rooms: merged });
            };
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("Failed to store visited rooms"));
    });
}

export const visitedRoomsCategory: CategoryHandler = {
    async export(selectedCharacters) {
        const visitedRooms = await exportVisitedRooms(selectedCharacters);
        return visitedRooms.length > 0 ? JSON.stringify(visitedRooms) : null;
    },
    async import(data) {
        await importVisitedRooms(Array.isArray(data) ? data : []);
    },
};

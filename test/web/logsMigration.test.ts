import { beforeEach, describe, expect, it, vi } from "vitest";
import { countSessions, openLogsDb, readSession, writeSession } from "@web/logsDatabase";

interface StoredRecord {
    text: string;
    timestamp: number;
    type?: string;
    character?: string;
}

const LEGACY = "ArkadiaMessagesDB";

function deleteDb(name: string): Promise<void> {
    return new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}

async function legacyExists(): Promise<boolean> {
    return (await indexedDB.databases()).some((database) => database.name === LEGACY);
}

/** Writes old-layout stores as the old logger did: one auto-incremented store per session. */
function seedLegacy(stores: Record<string, StoredRecord[]>): Promise<void> {
    return new Promise((resolve, reject) => {
        const probe = indexedDB.open(LEGACY);
        probe.onsuccess = () => {
            const version = probe.result.version;
            probe.result.close();
            const request = indexedDB.open(LEGACY, version + 1);
            request.onupgradeneeded = () => {
                for (const name of Object.keys(stores)) {
                    if (!request.result.objectStoreNames.contains(name)) {
                        request.result.createObjectStore(name, { autoIncrement: true });
                    }
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(Object.keys(stores), "readwrite");
                for (const [name, records] of Object.entries(stores)) {
                    for (const record of records) tx.objectStore(name).add(record);
                }
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => reject(tx.error);
            };
            request.onerror = () => reject(request.error);
        };
        probe.onerror = () => reject(probe.error);
    });
}

/** What the current database holds: record counts, and each session's texts. */
async function current(): Promise<{ counts: Map<string, number>; texts: Record<string, string[]> }> {
    const db = await openLogsDb();
    if (!db) throw new Error("no database");
    const counts = await countSessions(db);
    const texts: Record<string, string[]> = {};
    for (const id of counts.keys()) texts[id] = (await readSession(db, id)).map((entry) => entry.text);
    db.close();
    return { counts, texts };
}

/** A fresh module each time: the move runs once per page. */
async function freshMigration() {
    vi.resetModules();
    return import("@web/logsMigration");
}

describe("migrateLegacyLogs", () => {
    beforeEach(async () => {
        await deleteDb(LEGACY);
        await deleteDb("ArkadiaLogsDB");
    });

    it("moves every old session, in order, and removes the old database", async () => {
        await seedLegacy({
            session_1000: [
                { text: "Witaj", timestamp: 1000, character: "alfa" },
                { text: "raz", timestamp: 2000 },
            ],
            session_5000: [{ text: "troll", timestamp: 5000 }],
        });

        const { migrateLegacyLogs, subscribeLogsMigration } = await freshMigration();
        const seen: ({ done: number; total: number } | null)[] = [];
        subscribeLogsMigration((progress) => seen.push(progress));
        await migrateLegacyLogs();

        const { counts, texts } = await current();
        expect([...counts.entries()]).toEqual([
            ["session_1000", 2],
            ["session_5000", 1],
        ]);
        expect(texts.session_1000).toEqual(["Witaj", "raz"]);
        expect(await legacyExists()).toBe(false);
        expect(seen).toEqual([null, { done: 0, total: 2 }, { done: 1, total: 2 }, { done: 2, total: 2 }, null]);
    });

    it("does not copy a session twice when the last run stopped before dropping it", async () => {
        await seedLegacy({ session_1000: [{ text: "a", timestamp: 1 }, { text: "b", timestamp: 2 }] });
        const db = await openLogsDb();
        await writeSession(db!, "session_1000", [
            { seq: 0, entry: { text: "a", timestamp: 1 } },
            { seq: 1, entry: { text: "b", timestamp: 2 } },
        ]);
        db!.close();

        const { migrateLegacyLogs } = await freshMigration();
        await migrateLegacyLogs();

        expect((await current()).texts.session_1000).toEqual(["a", "b"]);
        expect(await legacyExists()).toBe(false);
    });

    it("appends what an old-build tab wrote after its session was moved", async () => {
        const db = await openLogsDb();
        await writeSession(db!, "session_1000", [{ seq: 0, entry: { text: "a", timestamp: 1 } }]);
        db!.close();
        // The old tab recreated its store and carried on logging.
        await seedLegacy({ session_1000: [{ text: "c", timestamp: 3 }] });

        const { migrateLegacyLogs } = await freshMigration();
        await migrateLegacyLogs();

        expect((await current()).texts.session_1000).toEqual(["a", "c"]);
    });

    it("leaves no old database behind when there was none", async () => {
        const { migrateLegacyLogs, legacyLogsPending } = await freshMigration();
        expect(await legacyLogsPending()).toBe(false);
        await migrateLegacyLogs();
        expect(await legacyExists()).toBe(false);
    });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
    createSessionSource,
    htmlToText,
    recordedBackground,
    resetSessionIndex,
} from "../../log-viewer/sessionAdapter";

const INDEX_KEY = "arkadia.logViewer.sessionIndex";

interface StoredRecord {
    text: string;
    timestamp: number;
    type?: string;
    character?: string;
}

function deleteDb(): Promise<void> {
    return new Promise((resolve) => {
        const request = indexedDB.deleteDatabase("ArkadiaMessagesDB");
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}

/** Writes the stores as the logger does: one auto-incremented record per message. */
function seed(stores: Record<string, StoredRecord[]>, version = 1): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("ArkadiaMessagesDB", version);
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
    });
}

describe("createSessionSource", () => {
    beforeEach(async () => {
        localStorage.clear();
        resetSessionIndex();
        await deleteDb();
        await seed({
            session_1000: [
                { text: "Witaj", timestamp: 1000, character: "alfa" },
                { text: "raz\ndwa", timestamp: 2000 },
            ],
            session_5000: [{ text: "troll", timestamp: 5000, character: "beta" }],
        });
    });

    it("lists entries without lines, oldest first", async () => {
        const source = createSessionSource({ candidates: [] });
        const sessions = await source.list();
        source.release();
        expect(sessions.map((session) => session.id)).toEqual(["session_1000", "session_5000"]);
        expect(sessions[0]).not.toHaveProperty("lines");
        expect(sessions[0].lineCount).toBe(3);
        expect(sessions[0].characters).toEqual(["Alfa"]);
        expect(sessions[1].characters).toEqual(["Beta"]);
    });

    it("hands the newest and the priority sessions over first, with progress", async () => {
        const updates: { ids: string[]; done: number; total: number }[] = [];
        const source = createSessionSource({ candidates: [], priority: ["session_1000"] });
        await source.list((sessions, progress) => updates.push({ ids: sessions.map((s) => s.id), ...progress }));
        source.release();
        expect(updates[0]).toEqual({ ids: ["session_1000", "session_5000"], done: 2, total: 2 });
    });

    it("reads a finished log once: the next opening takes it from the index", async () => {
        const first = createSessionSource({ candidates: [] });
        await first.list();
        first.release();

        // An entry that could only have come from the index, not the store.
        const stored = JSON.parse(localStorage.getItem(INDEX_KEY)!);
        stored.entries.session_1000.lineCount = 99;
        localStorage.setItem(INDEX_KEY, JSON.stringify(stored));
        resetSessionIndex();

        const second = createSessionSource({ candidates: [] });
        const sessions = await second.list();
        second.release();
        expect(sessions[0].lineCount).toBe(99);
    });

    it("reads a log again once its record count changed", async () => {
        const first = createSessionSource({ candidates: [] });
        await first.list();
        first.release();

        await seed({ session_5000: [{ text: "jeszcze", timestamp: 6000 }] }, 1);
        const second = createSessionSource({ candidates: [] });
        const sessions = await second.list();
        second.release();
        expect(sessions[1].lineCount).toBe(2);
        expect(sessions[1].endedAt).toBe(6000);
    });

    it("drops index entries of stores that are gone", async () => {
        const first = createSessionSource({ candidates: [] });
        await first.list();
        first.release();
        await deleteDb();
        await seed({ session_5000: [{ text: "troll", timestamp: 5000 }] });

        const second = createSessionSource({ candidates: [] });
        await second.list();
        second.release();
        expect(Object.keys(JSON.parse(localStorage.getItem(INDEX_KEY)!).entries)).toEqual(["session_5000"]);
    });

    it("loads one session with its lines", async () => {
        const source = createSessionSource({ candidates: [], liveSessionName: "session_5000" });
        const session = await source.load("session_5000");
        source.release();
        expect(session?.lines.map((line) => line.text)).toEqual(["troll"]);
        expect(session?.live).toBe(true);
        expect(session?.lineCount).toBe(1);
    });

    it("returns null for a session that does not exist", async () => {
        const source = createSessionSource({ candidates: [] });
        expect(await source.load("session_42")).toBeNull();
        source.release();
    });

    it("stops listing once aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const source = createSessionSource({ candidates: [] });
        expect(await source.list(undefined, controller.signal)).toEqual([]);
        source.release();
    });

    it("loads nothing after release, so a late call cannot hold the database", async () => {
        const source = createSessionSource({ candidates: [] });
        source.release();
        expect(await source.load("session_5000")).toBeNull();
        expect(await source.list()).toEqual([]);
    });
});

describe("htmlToText", () => {
    it("drops tags and decodes the entities the logger writes", () => {
        expect(htmlToText('<span style="color: #f00">Ork</span> &lt;wrog&gt; &amp; &quot;on&quot;')).toBe('Ork <wrog> & "on"');
    });

    it("decodes numeric and other named entities", () => {
        expect(htmlToText("&#261;&#x107;&nbsp;&eacute;")).toBe("ąć é");
    });

    it("returns plain text untouched", () => {
        expect(htmlToText("zwykla linia")).toBe("zwykla linia");
    });

    it("does not run markup", () => {
        expect(htmlToText('<img src=x onerror="window.__ran=1">tekst')).toBe("tekst");
        expect((window as unknown as { __ran?: number }).__ran).toBeUndefined();
    });
});

describe("recordedBackground", () => {
    it("is the last background the log recorded", () => {
        expect(
            recordedBackground([
                { text: "a", timestamp: 1, background: "#111" },
                { text: "b", timestamp: 2 },
                { text: "c", timestamp: 3, background: "#eee" },
                { text: "d", timestamp: 4 },
            ]),
        ).toBe("#eee");
        expect(recordedBackground([{ text: "a", timestamp: 1 }])).toBeUndefined();
    });
});

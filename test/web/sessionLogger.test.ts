import type EventBus from "@modules/core/eventBus";

/**
 * The write-time half of character attribution: the logger has to leave a mark
 * where the character changed, and nowhere else. Everything the viewer does
 * with that mark is `model/characters.ts`, tested separately.
 */
describe("sessionLogger character marks", () => {
    let write: (text?: string, type?: string, timestamp?: number) => void;
    let storeName: string;
    /** The bus the freshly imported logger listens on, not the one this file would get. */
    let bus: typeof EventBus;

    async function records(): Promise<{ text: string; character?: string }[]> {
        const { openLogsDb } = await import("@web/logsDatabase");
        const { getRawSessionData } = await import("@web/logBrowserUtils");
        const db = await openLogsDb();
        if (!db) return [];
        const entries = (await getRawSessionData(db, storeName)) as { text: string; character?: string }[];
        db.close();
        return entries;
    }

    /** A line is written through an open of the database, so wait for it to land. */
    async function settled(count: number): Promise<{ text: string; character?: string }[]> {
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const entries = await records();
            if (entries.length >= count) return entries;
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return records();
    }

    beforeEach(async () => {
        jest.resetModules();
        // The store is named after the moment the module loaded, and two tests
        // can load it in the same millisecond.
        await new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase("ArkadiaMessagesDB");
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
        });
        bus = (await import("@modules/core/eventBus")).default;
        const module = await import("@web/sessionLogger");
        storeName = module.currentSessionName;
        const client = {
            on: (_event: string, handler: (text?: string, type?: string, timestamp?: number) => void) => {
                write = handler;
            },
        };
        await module.default(client as never);
    });

    it("stamps the name onto the first line after the character changed, and no other", async () => {
        write("przed zalogowaniem", "system", 1000);
        bus.emit("player.character", "dargoth");
        write("Polaczono", "system.login", 2000);
        write("Rynek w Bandzie", "room.short", 3000);

        expect(await settled(3)).toEqual([
            { text: "przed zalogowaniem", type: "system", timestamp: 1000 },
            { text: "Polaczono", type: "system.login", timestamp: 2000, character: "dargoth" },
            { text: "Rynek w Bandzie", type: "room.short", timestamp: 3000 },
        ]);
    });

    it("marks a relogin as a second mark in the same log", async () => {
        bus.emit("player.character", "dargoth");
        write("Polaczono", "system.login", 1000);
        write("Rynek", "room.short", 2000);
        bus.emit("player.character", "kethra");
        write("Polaczono", "system.login", 3000);

        expect((await settled(3)).map((entry) => entry.character)).toEqual([
            "dargoth",
            undefined,
            "kethra",
        ]);
    });

    it("writes no character at all for a session that never reached the game", async () => {
        write("Laczenie...", "system", 1000);

        const entries = await settled(1);
        expect(entries).toHaveLength(1);
        expect(entries.every((entry) => entry.character === undefined)).toBe(true);
    });
});

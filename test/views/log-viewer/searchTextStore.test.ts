import { beforeEach, describe, expect, it } from "vitest";
import { packText, SEARCH_DB_NAME, SearchTextStore, unpackText, type StoredSearchText } from "../../../views/log-viewer/searchTextStore";

function deleteDb(): Promise<void> {
    return new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(SEARCH_DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}

/** The record as it lies in the database, past the store. */
function rawRecord(id: string): Promise<Record<string, unknown> | undefined> {
    return new Promise((resolve) => {
        const request = indexedDB.open(SEARCH_DB_NAME, 1);
        request.onsuccess = () => {
            const db = request.result;
            const get = db.transaction("texts").objectStore("texts").get(id);
            get.onsuccess = () => {
                db.close();
                resolve(get.result as Record<string, unknown> | undefined);
            };
        };
    });
}

function putRaw(id: string, record: unknown): Promise<void> {
    return new Promise((resolve) => {
        const request = indexedDB.open(SEARCH_DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("texts");
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("texts", "readwrite");
            tx.objectStore("texts").put(record, id);
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
        };
    });
}

const TEXT = ["Krasnolud mówi: Żółć gęślą jaźń!", "Atakujesz orka.", "Atakujesz orka.", "Atakujesz orka."].join("\n");

function entry(text = TEXT): StoredSearchText {
    return {
        count: 4,
        text,
        channels: new Uint8Array([1, 2, 2, 2]),
        channelNames: ["inne", "rozmowa", "walka"],
        characterRuns: [{ line: 0, character: "Dargoth" }],
    };
}

describe("SearchTextStore", () => {
    beforeEach(deleteDb);

    it("stores the text packed and gives it back whole", async () => {
        const store = new SearchTextStore();
        await store.put("session_1", entry());
        const raw = await rawRecord("session_1");
        expect(raw?.text).toBeUndefined();
        expect(ArrayBuffer.isView(raw?.packed)).toBe(true);

        const read = await store.get("session_1");
        store.release();
        expect(read?.text).toBe(TEXT);
        expect(read?.count).toBe(4);
        expect(Array.from(read!.channels)).toEqual([1, 2, 2, 2]);
        expect(read?.characterRuns).toEqual([{ line: 0, character: "Dargoth" }]);
    });

    it("packs repetitive game text far below its length", async () => {
        const long = Array.from({ length: 2000 }, (_, i) => `Atakujesz orka numer ${i % 7}, ale chybiasz.`).join("\n");
        const packed = (await packText(long))!;
        expect(packed.length).toBeLessThan(long.length / 5);
        expect(await unpackText(packed)).toBe(long);
    });

    it("reads an entry stored plain by an earlier build, and packs it", async () => {
        await putRaw("session_old", entry());
        const store = new SearchTextStore();
        expect((await store.get("session_old"))?.text).toBe(TEXT);
        // Repacked in the background.
        await expect.poll(async () => ArrayBuffer.isView((await rawRecord("session_old"))?.packed)).toBe(true);
        expect((await rawRecord("session_old"))?.text).toBeUndefined();
        expect((await store.get("session_old"))?.text).toBe(TEXT);
        store.release();
    });

    it("treats an entry it cannot unpack as missing, so the log is read again", async () => {
        const { text: _text, ...rest } = entry();
        await putRaw("session_bad", { ...rest, packed: new Uint8Array([1, 2, 3, 4, 5]) });
        const store = new SearchTextStore();
        expect(await store.get("session_bad")).toBeNull();
        store.release();
    });
});

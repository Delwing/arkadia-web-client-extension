import { describe, expect, it } from "vitest";
import { entriesToLines, sessionStartFromName } from "../../log-viewer/sessionAdapter";

describe("sessionStartFromName", () => {
    it("reads the timestamp out of a session store name", () => {
        expect(sessionStartFromName("session_1758304931000")).toBe(1758304931000);
    });

    it("returns null for anything that is not one", () => {
        expect(sessionStartFromName("downloaded")).toBeNull();
        expect(sessionStartFromName("session_abc")).toBeNull();
    });
});

describe("entriesToLines", () => {
    it("numbers lines across records, not within them", () => {
        // A stored record is one message and may be several lines; line numbers
        // have to be stable per session or they stop meaning anything.
        const { lines } = entriesToLines([
            { text: "pierwsza\ndruga", type: "room.long", timestamp: 1000 },
            { text: "trzecia", type: "comm", timestamp: 2000 },
        ]);
        expect(lines.map((line) => line.number)).toEqual([1, 2, 3]);
        expect(lines.map((line) => line.text)).toEqual(["pierwsza", "druga", "trzecia"]);
    });

    it("carries the record's timestamp onto each of its lines", () => {
        const { lines } = entriesToLines([{ text: "a\nb", type: "system", timestamp: 4242 }]);
        expect(lines.every((line) => line.timestamp === 4242)).toBe(true);
    });

    it("classifies from the stored GMCP type", () => {
        const { lines } = entriesToLines([
            { text: "Atakujesz!", type: "combat.avatar", timestamp: 1 },
            { text: "Brannoc mowi: czesc", type: "comm", timestamp: 2 },
            { text: "> polnoc", type: "command", timestamp: 3 },
        ]);
        expect(lines.map((line) => line.channel)).toEqual(["combat", "comm", "command"]);
    });

    it("strips markup for the searchable text but keeps the original", () => {
        const {
            lines: [line],
        } = entriesToLines([{ text: '<span style="color:#f00">czerwony</span>', type: "system", timestamp: 1 }]);
        expect(line.text).toBe("czerwony");
        expect(line.html).toContain("<span");
    });

    it("keeps no html for a line that had none", () => {
        const {
            lines: [line],
        } = entriesToLines([{ text: "zwykly tekst", type: "system", timestamp: 1 }]);
        expect(line.html).toBeUndefined();
    });

    it("marks events as it goes", () => {
        const { lines } = entriesToLines([
            { text: "Polaczono", type: "system.login", timestamp: 1 },
            { text: "Twoje cechy sa oslabione po ostatniej smierci.", type: "system", timestamp: 2 },
            { text: "Rynek", type: "room.short", timestamp: 3 },
        ]);
        expect(lines.map((line) => line.event)).toEqual(["login", "death", undefined]);
    });

    it("reads a stamped character as a mark on the line the record starts at", () => {
        const { marks } = entriesToLines([
            { text: "pierwsza\ndruga", type: "room.long", timestamp: 1000 },
            { text: "Polaczono", type: "system.login", timestamp: 2000, character: "dargoth" },
            { text: "trzecia", type: "comm", timestamp: 3000 },
            { text: "Polaczono", type: "system.login", timestamp: 4000, character: "kethra" },
        ]);
        expect(marks).toEqual([
            { line: 2, character: "dargoth" },
            { line: 4, character: "kethra" },
        ]);
    });

    it("finds no marks in a log recorded before the client stamped them", () => {
        const { marks } = entriesToLines([{ text: "Rynek", type: "room.short", timestamp: 1 }]);
        expect(marks).toEqual([]);
    });
});

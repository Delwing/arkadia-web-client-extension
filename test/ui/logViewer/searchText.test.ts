import { describe, expect, it } from "vitest";
import { tallySession } from "@ui/logViewer/model/crossHits";
import { makeMatcher } from "@ui/logViewer/model/search";
import { tallySearchText, toSearchText } from "@ui/logViewer/model/searchText";
import type { LogLine } from "@ui/logViewer/model/types";

function line(number: number, text: string, channel: LogLine["channel"], character?: string): LogLine {
    return { number, timestamp: number * 1000, channel, text, character };
}

const lines = [
    line(1, "Troll wychodzi", "combat"),
    line(2, "troll na rynku, troll", "room", "Alfa"),
    line(3, "nic tu nie ma", "comm", "Alfa"),
    line(4, "troll bije trolla", "combat", "Beta"),
    line(5, "", "other", "Beta"),
    line(6, "troll mowi", "comm", "Gamma"),
];

const cases: [string, { regex: boolean; caseSensitive: boolean }][] = [
    ["troll", { regex: false, caseSensitive: false }],
    ["Troll", { regex: false, caseSensitive: true }],
    ["^troll", { regex: true, caseSensitive: false }],
    ["l{2}a$", { regex: true, caseSensitive: true }],
    ["brak", { regex: false, caseSensitive: false }],
];

describe("searchText", () => {
    it.each(cases)("tallies %s as the lines do", (query, options) => {
        const regex = makeMatcher(query, options).regex!;
        const fromText = tallySearchText(toSearchText(lines), query, options, regex);
        expect(fromText).toEqual(tallySession(lines, query, options, regex));
    });

    it("keeps one character run per change of character", () => {
        expect(toSearchText(lines).characterRuns).toEqual([
            { line: 0, character: undefined },
            { line: 1, character: "Alfa" },
            { line: 3, character: "Beta" },
            { line: 5, character: "Gamma" },
        ]);
    });

    it("reads channels by the names stored with them", () => {
        const stored = toSearchText(lines);
        // A later build that ordered its channels differently.
        const reordered = { ...stored, channelNames: [...stored.channelNames] };
        const options = { regex: false, caseSensitive: false };
        const tally = tallySearchText(reordered, "troll", options, makeMatcher("troll", options).regex!);
        expect(tally.combat?.count).toBe(3);
        expect(tally.room?.count).toBe(2);
    });
});

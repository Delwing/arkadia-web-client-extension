import { describe, expect, it } from "vitest";
import { allChannelsOn } from "@ui/logViewer/model/channels";
import { tallySession, totalCrossHits } from "@ui/logViewer/model/crossHits";
import { makeMatcher } from "@ui/logViewer/model/search";
import type { LogLine } from "@ui/logViewer/model/types";

function line(number: number, text: string, channel: LogLine["channel"], character?: string): LogLine {
    return { number, timestamp: number * 1000, channel, text, character };
}

const lines = [
    line(1, "troll wychodzi", "combat", "Alfa"),
    line(2, "troll na rynku", "room", "Alfa"),
    line(3, "troll bije trolla", "combat", "Beta"),
    line(4, "troll mowi", "comm", "Gamma"),
];

function tally(query: string) {
    const options = { regex: false, caseSensitive: false };
    return tallySession(lines, query, options, makeMatcher(query, options).regex!);
}

describe("crossHits", () => {
    it("adds up every channel's hits and names who played at either end", () => {
        const result = totalCrossHits(new Map([["s", tally("troll")]]), allChannelsOn());
        expect(result.hitsBySession.s).toBe(5);
        expect(result.matchEdges.s).toEqual({ first: "Alfa", last: "Gamma" });
    });

    it("re-totals for a channel filter without the lines", () => {
        const channels = { ...allChannelsOn(), room: false, comm: false };
        const result = totalCrossHits(new Map([["s", tally("troll")]]), channels);
        expect(result.hitsBySession.s).toBe(3);
        expect(result.matchEdges.s).toEqual({ first: "Alfa", last: "Beta" });
    });

    it("is zero, with no edges, when every channel with hits is hidden", () => {
        const channels = { ...allChannelsOn(), combat: false, room: false, comm: false };
        const result = totalCrossHits(new Map([["s", tally("troll")]]), channels);
        expect(result.hitsBySession.s).toBe(0);
        expect(result.matchEdges.s).toEqual({});
    });
});

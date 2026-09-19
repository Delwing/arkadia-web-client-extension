import { describe, expect, it } from "vitest";
import { allChannelsOn } from "@ui/logViewer/model/channels";
import type { LogLine, LogSession } from "@ui/logViewer/model/types";
import {
    applyPreferences,
    deriveView,
    initialSessionId,
    initialViewerState,
    orderSessions,
    pickPreferences,
    stepMatch,
    type ViewerState,
} from "@ui/logViewer/model/viewerState";

const T0 = 1_700_000_000_000;

function line(number: number, text: string, channel: LogLine["channel"] = "system"): LogLine {
    return { number, timestamp: T0 + number * 1000, channel, text };
}

function session(id: string, lines: LogLine[], extra: Partial<LogSession> = {}): LogSession {
    return {
        id,
        character: id,
        dayLabel: "Dzisiaj",
        dateLabel: "sob 19 wrz 2026",
        startedAt: lines[0]?.timestamp ?? T0,
        endedAt: lines[lines.length - 1]?.timestamp ?? T0,
        live: false,
        file: `${id}.txt`,
        lines,
        ...extra,
    };
}

const sessionA = session("a", [
    line(1, "troll wychodzi z groty", "combat"),
    line(2, "Rynek w Bandzie", "room"),
    line(3, "troll bije trolla", "combat"),
    line(4, "cisza", "comm"),
]);

const sessionB = session("b", [line(1, "inny troll", "combat"), line(2, "nic tu nie ma", "room")], {
    character: "Dorn",
});

function state(overrides: Partial<ViewerState> = {}): ViewerState {
    return { ...initialViewerState("a"), ...overrides };
}

describe("deriveView", () => {
    it("shows every line when nothing is filtered", () => {
        const view = deriveView([sessionA], state());
        expect(view.rows).toHaveLength(4);
        expect(view.totalMatches).toBe(0);
        expect(view.searching).toBe(false);
    });

    it("counts a line's matches separately, so a line with two hits is two stops", () => {
        const view = deriveView([sessionA], state({ query: "troll" }));
        // Row 2 is "troll bije trolla", which holds two of the three.
        expect(view.totalMatches).toBe(3);
        expect(view.matches.filter((match) => match.row === 2)).toHaveLength(2);
        expect(view.matches.map((match) => match.occurrence)).toEqual([0, 0, 1]);
    });

    it("hides muted channels and keeps original line numbers", () => {
        const view = deriveView([sessionA], state({ channels: { ...allChannelsOn(), room: false } }));
        expect(view.rows).toHaveLength(3);
        expect(view.rows.map((row) => row.number)).toEqual([1, 3, 4]);
    });

    it("counts every channel even while one is hidden, so chip counts stay stable", () => {
        const view = deriveView([sessionA], state({ channels: { ...allChannelsOn(), room: false } }));
        expect(view.channelCounts.room).toBe(1);
        expect(view.channelCounts.combat).toBe(2);
    });

    it("drops non-matching lines in matching-lines-only mode", () => {
        const view = deriveView([sessionA], state({ query: "troll", onlyMatches: true }));
        expect(view.rows.map((row) => row.number)).toEqual([1, 3]);
    });

    it("counts hits per session, respecting the channel filter", () => {
        const withRoom = deriveView([sessionA, sessionB], state({ query: "troll", scope: "all" }));
        expect(withRoom.hitsBySession).toEqual({ a: 3, b: 1 });

        const noCombat = deriveView(
            [sessionA, sessionB],
            state({ query: "troll", scope: "all", channels: { ...allChannelsOn(), combat: false } }),
        );
        expect(noCombat.hitsBySession).toEqual({ a: 0, b: 0 });
    });

    it("reports an invalid pattern without highlighting anything", () => {
        const view = deriveView([sessionA], state({ query: "[a-", regex: true }));
        expect(view.invalidPattern).toBe(true);
        expect(view.totalMatches).toBe(0);
        expect(view.rows).toHaveLength(4);
    });

    it("normalises a match index that ran off either end", () => {
        expect(deriveView([sessionA], state({ query: "troll", matchIndex: 3 })).currentMatch).toBe(0);
        expect(deriveView([sessionA], state({ query: "troll", matchIndex: -1 })).currentMatch).toBe(2);
    });

    it("filters the sidebar on character, day and file name", () => {
        const view = deriveView([sessionA, sessionB], state({ sessionFilter: "dorn" }));
        expect(view.visibleSessions.map((entry) => entry.id)).toEqual(["b"]);
        expect(deriveView([sessionA, sessionB], state({ sessionFilter: "a.txt" })).visibleSessions).toHaveLength(1);
    });

    it("falls back to the first session when the selected id is gone", () => {
        expect(deriveView([sessionB], state({ sessionId: "missing" })).session.id).toBe("b");
    });
});

describe("session order", () => {
    const older = session("older", [line(1, "a")], { startedAt: T0 - 86_400_000 });
    const newer = session("newer", [line(1, "b")], { startedAt: T0 });
    const liveOne = session("live", [line(1, "c")], { startedAt: T0 - 3_600_000, live: true });

    it("puts the newest session first, whatever order it was handed", () => {
        expect(orderSessions([older, newer]).map((entry) => entry.id)).toEqual(["newer", "older"]);
        expect(orderSessions([newer, older]).map((entry) => entry.id)).toEqual(["newer", "older"]);
    });

    it("opens on the newest session by time, not by array position", () => {
        // The IndexedDB adapter hands these over oldest-first; mock data comes
        // newest-first. Neither should decide which log opens.
        expect(initialSessionId([older, newer])).toBe("newer");
        expect(initialSessionId([newer, older])).toBe("newer");
    });

    it("prefers a session still being recorded", () => {
        expect(initialSessionId([older, newer, liveOne])).toBe("live");
    });

    it("has nothing to open when there are no sessions", () => {
        expect(initialSessionId([])).toBe("");
    });

    it("shows the sidebar newest-first regardless of input order", () => {
        const view = deriveView([older, newer], state({ sessionId: "newer" }));
        expect(view.visibleSessions.map((entry) => entry.id)).toEqual(["newer", "older"]);
    });
});

describe("stepMatch, this-log scope", () => {
    const base = state({ query: "troll" });

    it("advances within the log without a notice", () => {
        const view = deriveView([sessionA], base);
        expect(stepMatch(1, base, view, [sessionA])).toEqual({ matchIndex: 1, notice: "" });
    });

    it("announces the wrap at the end", () => {
        const current = { ...base, matchIndex: 2 };
        const view = deriveView([sessionA], current);
        const result = stepMatch(1, current, view, [sessionA])!;
        expect(result.matchIndex).toBe(3);
        expect(result.notice).toContain("pierwszego");
    });

    it("announces the wrap at the start", () => {
        const view = deriveView([sessionA], base);
        const result = stepMatch(-1, base, view, [sessionA])!;
        expect(result.matchIndex).toBe(-1);
        expect(result.notice).toContain("ostatniego");
    });

    it("does nothing when there is nothing to step through", () => {
        const empty = state({ query: "nieobecne" });
        expect(stepMatch(1, empty, deriveView([sessionA], empty), [sessionA])).toBeNull();
    });
});

describe("stepMatch, all-logs scope", () => {
    const order = [sessionA, sessionB];

    it("crosses into the next session with matches and says so", () => {
        const current = state({ query: "troll", scope: "all", matchIndex: 2 });
        const result = stepMatch(1, current, deriveView(order, current), order)!;
        expect(result.sessionId).toBe("b");
        expect(result.matchIndex).toBe(0);
        expect(result.notice).toContain("Dalej");
    });

    it("crosses backwards onto the previous session's LAST match", () => {
        const current = state({ sessionId: "b", query: "troll", scope: "all", matchIndex: 0 });
        const result = stepMatch(-1, current, deriveView(order, current), order)!;
        expect(result.sessionId).toBe("a");
        // -1 is the agreed "last match" sentinel; deriveView normalises it.
        expect(result.matchIndex).toBe(-1);
        expect(result.notice).toContain("Powrot");
    });

    it("skips sessions that have no matches", () => {
        const quiet = session("c", [line(1, "nic")]);
        const withQuiet = [sessionA, quiet, sessionB];
        const current = state({ query: "troll", scope: "all", matchIndex: 2 });
        const result = stepMatch(1, current, deriveView(withQuiet, current), withQuiet)!;
        expect(result.sessionId).toBe("b");
    });

    it("wraps locally when no other session has matches", () => {
        const only = [sessionA];
        const current = state({ query: "troll", scope: "all", matchIndex: 2 });
        const result = stepMatch(1, current, deriveView(only, current), only)!;
        expect(result.sessionId).toBeUndefined();
        expect(result.notice).toContain("pierwszego");
    });
});

describe("preferences", () => {
    it("round-trips the persisted slice", () => {
        const source = state({ wrap: false, density: "comfortable", scope: "all", showTimestamps: false });
        const restored = applyPreferences(initialViewerState("a"), pickPreferences(source));
        expect(restored.wrap).toBe(false);
        expect(restored.density).toBe("comfortable");
        expect(restored.scope).toBe("all");
        expect(restored.showTimestamps).toBe(false);
    });

    it("does not persist the query or the match position", () => {
        const stored = pickPreferences(state({ query: "troll", matchIndex: 4 }));
        expect(stored).not.toHaveProperty("query");
        expect(stored).not.toHaveProperty("matchIndex");
    });

    it("ignores junk rather than breaking the viewer", () => {
        const base = initialViewerState("a");
        expect(applyPreferences(base, null)).toEqual(base);
        expect(applyPreferences(base, "nonsense")).toEqual(base);
        expect(applyPreferences(base, { density: "enormous", scope: 7, channels: { combat: "yes" } })).toEqual(base);
    });

    it("restores a partial channel filter", () => {
        const restored = applyPreferences(initialViewerState("a"), { channels: { combat: false } });
        expect(restored.channels.combat).toBe(false);
        expect(restored.channels.comm).toBe(true);
    });
});

import { describe, expect, it } from "vitest";
import { allChannelsOn } from "@ui/logViewer/model/channels";
import type { LogLine, LogSession, LogSessionInfo } from "@ui/logViewer/model/types";
import {
    applyPreferences,
    appliedRange,
    deriveView,
    effectiveScope,
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
        characters: [id],
        dayLabel: "Dzisiaj",
        dateLabel: "sob 19 wrz 2026",
        startedAt: lines[0]?.timestamp ?? T0,
        endedAt: lines[lines.length - 1]?.timestamp ?? T0,
        live: false,
        file: `${id}.txt`,
        lineCount: lines.length,
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
    characters: ["Dorn"],
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

describe("deriveView over a list without lines", () => {
    const entry = ({ lines: _lines, ...info }: LogSession): LogSessionInfo => info;

    it("shows nothing for the selected session until its lines arrive", () => {
        const view = deriveView([entry(sessionA)], state());
        expect(view.sessionInfo?.id).toBe("a");
        expect(view.session).toBeUndefined();
        expect(view.rows).toHaveLength(0);
    });

    it("renders the loaded lines of the selected session", () => {
        const view = deriveView([entry(sessionA), entry(sessionB)], state(), { open: sessionA });
        expect(view.session).toBe(sessionA);
        expect(view.rows).toHaveLength(4);
    });

    it("ignores lines loaded for a session that is no longer selected", () => {
        const view = deriveView([entry(sessionA), entry(sessionB)], state({ sessionId: "b" }), { open: sessionA });
        expect(view.sessionInfo?.id).toBe("b");
        expect(view.session).toBeUndefined();
    });

    it("takes other sessions' hits from crossHits in All-logs scope, and counts the open one itself", () => {
        const view = deriveView([entry(sessionA), entry(sessionB)], state({ query: "troll", scope: "all" }), {
            open: sessionA,
            crossHits: { hitsBySession: { a: 99, b: 5 }, matchEdges: { b: { first: "Dorn", last: "Dorn" } } },
        });
        expect(view.hitsBySession).toEqual({ a: 3, b: 5 });
        expect(view.matchEdges.b).toEqual({ first: "Dorn", last: "Dorn" });
    });

    it("counts only the open session outside All-logs scope", () => {
        const view = deriveView([sessionA, sessionB], state({ query: "troll" }));
        expect(view.hitsBySession).toEqual({ a: 3 });
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

describe("range", () => {
    // sessionA's four lines sit one second apart from T0 + 1s.
    const at = (second: number) => T0 + second * 1000;

    /**
     * Every case below pins the scope to "Zakres", because that is the scope in
     * which a slice is applied. In "Ten log" and "Wszystkie logi" the slice is
     * still selected — the handles stay on the timeline — but it hides nothing,
     * so that a scope promising the whole log can deliver it. See
     * `appliedRange`.
     */
    const sliced = (overrides: Partial<ViewerState> = {}): ViewerState =>
        state({ scope: "range", ...overrides });

    it("drops lines outside the slice", () => {
        const view = deriveView([sessionA], sliced({ range: { from: at(2), to: at(3) } }));
        expect(view.rows.map((entry) => entry.number)).toEqual([2, 3]);
    });

    it("keeps original line numbers inside the slice", () => {
        const view = deriveView([sessionA], sliced({ range: { from: at(3), to: at(4) } }));
        expect(view.rows.map((entry) => entry.number)).toEqual([3, 4]);
    });

    it("includes lines exactly on each bound", () => {
        const view = deriveView([sessionA], sliced({ range: { from: at(1), to: at(1) } }));
        expect(view.rows.map((entry) => entry.number)).toEqual([1]);
    });

    it("counts every channel regardless of the slice, so chip counts stay put", () => {
        const view = deriveView([sessionA], sliced({ range: { from: at(4), to: at(4) } }));
        expect(view.rows).toHaveLength(1);
        expect(view.channelCounts.combat).toBe(2);
        expect(view.channelCounts.room).toBe(1);
    });

    it("scopes the match counter to the slice", () => {
        const all = deriveView([sessionA], state({ query: "troll" }));
        expect(all.totalMatches).toBe(3);
        const inSlice = deriveView([sessionA], sliced({ query: "troll", range: { from: at(1), to: at(1) } }));
        expect(inSlice.totalMatches).toBe(1);
    });

    it("leaves other sessions' hit badges alone", () => {
        // The range belongs to the open session; applying it to a sibling's
        // badge would silently under-report it.
        const view = deriveView(
            [sessionA, sessionB],
            state({ query: "troll", scope: "all", range: { from: at(1), to: at(1) } }),
        );
        expect(view.hitsBySession.b).toBe(1);
    });

    it("combines with channel filters", () => {
        const view = deriveView(
            [sessionA],
            sliced({ range: { from: at(1), to: at(3) }, channels: { ...allChannelsOn(), room: false } }),
        );
        expect(view.rows.map((entry) => entry.number)).toEqual([1, 3]);
    });

    it("can select nothing, which the empty state then explains", () => {
        const view = deriveView([sessionA], sliced({ range: { from: at(90), to: at(99) } }));
        expect(view.rows).toEqual([]);
    });

    it("hides nothing in the wider scopes, so 'Ten log' really is the whole log", () => {
        const slice = { from: at(1), to: at(1) };
        expect(deriveView([sessionA], state({ scope: "log", range: slice })).rows).toHaveLength(4);
        expect(deriveView([sessionA], state({ scope: "all", range: slice })).rows).toHaveLength(4);
        expect(deriveView([sessionA], sliced({ range: slice })).rows).toHaveLength(1);
    });

    it("reports the slice actually in force, which is what the timeline scrims", () => {
        const slice = { from: at(1), to: at(2) };
        expect(deriveView([sessionA], sliced({ range: slice })).range).toEqual(slice);
        expect(deriveView([sessionA], state({ scope: "log", range: slice })).range).toBeNull();
    });
});

describe("effectiveScope", () => {
    it("leaves the two log scopes alone", () => {
        expect(effectiveScope({ scope: "log", range: null })).toBe("log");
        expect(effectiveScope({ scope: "all", range: null })).toBe("all");
    });

    it("falls back to the open log when the range it named is gone", () => {
        expect(effectiveScope({ scope: "range", range: null })).toBe("log");
        expect(appliedRange({ scope: "range", range: null })).toBeNull();
    });

    it("searches a log whole in 'range' scope with no range, rather than nothing", () => {
        const view = deriveView([sessionA], state({ scope: "range", query: "troll" }));
        expect(view.totalMatches).toBe(3);
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

    it("names the character playing where the jump lands, not the whole list", () => {
        // The sub-line does not wrap, so a session spanning three characters
        // still gets one name: the one on the match being jumped to.
        const twoChars = session(
            "c",
            [
                { ...line(1, "troll na poczatku", "combat"), character: "Dargoth" },
                { ...line(2, "troll na koncu", "combat"), character: "Kethra" },
            ],
            { dayLabel: "Wczoraj" },
        );
        const order = [sessionA, twoChars];

        const forward = state({ query: "troll", scope: "all", matchIndex: 2 });
        expect(stepMatch(1, forward, deriveView(order, forward), order)!.notice).toBe(
            "Dalej w: Dargoth, Wczoraj",
        );

        // Backwards the jump lands on that session's LAST match, so it is the
        // character playing there that gets named.
        const back = state({ sessionId: "a", query: "troll", scope: "all", matchIndex: 0 });
        expect(stepMatch(-1, back, deriveView(order, back), order)!.notice).toBe("Powrot do: Kethra, Wczoraj");
    });

    it("says only the day for a session whose character is not known", () => {
        const unnamed = session("c", [line(1, "troll bez imienia", "combat")], {
            characters: [],
            dayLabel: "Wczoraj",
        });
        const order = [sessionA, unnamed];
        const current = state({ query: "troll", scope: "all", matchIndex: 2 });
        expect(stepMatch(1, current, deriveView(order, current), order)!.notice).toBe("Dalej w: Wczoraj");
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
        const source = state({ wrap: false, scope: "all", showTimestamps: false, showColors: false });
        const restored = applyPreferences(initialViewerState("a"), pickPreferences(source));
        expect(restored.wrap).toBe(false);
        expect(restored.scope).toBe("all");
        expect(restored.showTimestamps).toBe(false);
        expect(restored.showColors).toBe(false);
    });

    it("does not persist the query or the match position", () => {
        const stored = pickPreferences(state({ query: "troll", matchIndex: 4 }));
        expect(stored).not.toHaveProperty("query");
        expect(stored).not.toHaveProperty("matchIndex");
    });

    it("does not persist the range", () => {
        // A slice belongs to the session it was drawn on; restoring it onto
        // whatever opens next would hide most of that log for no visible reason.
        const stored = pickPreferences(state({ range: { from: 1, to: 2 } }));
        expect(stored).not.toHaveProperty("range");
    });

    it("round-trips the tag/line-number toggle", () => {
        const restored = applyPreferences(initialViewerState("a"), pickPreferences(state({ showMeta: false })));
        expect(restored.showMeta).toBe(false);
    });

    it("shows the game's colours by default", () => {
        expect(initialViewerState("a").showColors).toBe(true);
    });

    it("ignores junk rather than breaking the viewer", () => {
        const base = initialViewerState("a");
        expect(applyPreferences(base, null)).toEqual(base);
        expect(applyPreferences(base, "nonsense")).toEqual(base);
        expect(applyPreferences(base, { wrap: "yes", scope: 7, channels: { combat: "yes" } })).toEqual(base);
        // A key from a version that had it — the log viewer used to store a
        // density. Preferences outlive the features they were written for.
        expect(applyPreferences(base, { density: "comfortable" })).toEqual(base);
    });

    it("restores a partial channel filter", () => {
        const restored = applyPreferences(initialViewerState("a"), { channels: { combat: false } });
        expect(restored.channels.combat).toBe(false);
        expect(restored.channels.comm).toBe(true);
    });

    it("leaves a channel the stored filter never heard of switched ON", () => {
        // A filter saved before `other` and `script` existed has six keys. The
        // merge walks CHANNELS and only overrides keys the stored object
        // actually carries, so the new ones keep their default — which has to
        // be on. A new channel defaulting to hidden looks exactly like lines
        // going missing, and nobody would connect it to an upgrade.
        const stored = {
            channels: {
                comm: true,
                combat: true,
                room: true,
                system: false,
                notify: true,
                command: true,
            },
        };
        const restored = applyPreferences(initialViewerState("a"), stored);
        expect(restored.channels.system).toBe(false);
        expect(restored.channels.other).toBe(true);
        expect(restored.channels.script).toBe(true);
    });
});

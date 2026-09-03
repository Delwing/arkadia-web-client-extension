import Client from "../Client";

/**
 * One GPS entry exactly as the map stores it in a room's `gps` userData.
 *
 * The same blob is read by the Mudlet package (`mapper/gps.lua`) and written by
 * the map editor, so nothing here may change shape — only new optional keys may
 * be added, which both of those ignore.
 *
 * Two stored keys are deliberately absent, because nothing has ever read them back:
 *
 * `room_id` — an entry is a property of the room it is stored in, so the room it syncs
 * to is already known. Mudlet writes it in `add_gps_to_room` and then builds its
 * triggers from the containing room id, never from this field, and so did every version
 * of this script. Trusting it would only change where one entry in the map points, and
 * that one disagrees with its own room by accident.
 *
 * `line_delta` — Mudlet sizes a line trigger with it and then kills that trigger on the
 * first line that does not match, so the sequence has to be consecutive whatever the
 * value says. The three entries carrying it in the map all set it to 0.
 */
interface GpsEntry {
    gps_string_lines?: string[];
    /**
     * Parallel to `gps_string_lines`: the slot holding `"regex"` marks that line as a
     * pattern instead of a literal; a missing or unknown slot leaves it literal.
     *
     * It is a side array rather than a richer element type inside `gps_string_lines`
     * on purpose: the Mudlet package feeds those elements straight to
     * `tempExactMatchTrigger`, so an object there would break it, while an extra key
     * it never reads costs it nothing — such an entry simply stops matching in Mudlet.
     */
    gps_line_modes?: (string | null)[];
    area_name?: string;
    within_room_ids?: (number | string)[];
}

/** A single line of an entry, resolved once at build time. */
type GpsLine = { literal: string } | { pattern: RegExp };

interface CompiledGps {
    /**
     * `${roomId}_${positionWithinTheRoom}`, counted from 1 — the id the Mudlet package
     * prints and its `/usun_gps` alias takes, and the number the map editor labels the
     * entry with. Whoever reads it off a sync message goes on to use it in one of those.
     */
    id: string;
    roomId: number;
    lines: GpsLine[];
    areaName?: string;
    withinRoomIds?: Set<number>;
}

/**
 * Triggers for one area are tagged together, so an area can be torn down and
 * rebuilt on its own without disturbing the rest of the map.
 */
function tagFor(areaId: number) {
    return `gps:${areaId}`;
}

function compileLines(entry: GpsEntry): GpsLine[] | undefined {
    const raw = entry.gps_string_lines;
    if (!raw || raw.length === 0) {
        return undefined;
    }
    const modes = entry.gps_line_modes;
    const lines: GpsLine[] = [];
    for (let i = 0; i < raw.length; i++) {
        const text = raw[i];
        if (typeof text !== "string" || text.length === 0) {
            return undefined;
        }
        if (modes?.[i] === "regex") {
            try {
                lines.push({pattern: new RegExp(text)});
            } catch {
                // A pattern the map cannot compile would otherwise take the whole entry
                // down on every line; drop the entry and leave the rest of the area alone.
                return undefined;
            }
        } else {
            // Entries are typed and pasted by hand, and at least one in the live map
            // carries a trailing space the game never sends; a literal is a fragment of
            // a line, so the whitespace around it was never part of what it means.
            const literal = text.trim();
            if (literal.length === 0) {
                return undefined;
            }
            lines.push({literal});
        }
    }
    return lines;
}

function compile(room: MapData.Room): CompiledGps[] {
    const raw = room.userData?.gps;
    if (!raw) {
        return [];
    }
    let entries: GpsEntry[];
    try {
        entries = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(entries)) {
        return [];
    }
    const compiled: CompiledGps[] = [];
    entries.forEach((entry, idx) => {
        const lines = compileLines(entry);
        if (!lines) {
            return;
        }
        compiled.push({
            id: `${room.id}_${idx + 1}`,
            roomId: room.id,
            lines,
            areaName: entry.area_name || undefined,
            withinRoomIds: entry.within_room_ids?.length
                ? new Set(entry.within_room_ids.map(id => Number(id)))
                : undefined,
        });
    });
    return compiled;
}

export default function initGps(client: Client) {

    /**
     * The last lines the game sent, oldest first, the current one last.
     *
     * A sequence is recognised when its *final* line arrives and the ones before it are
     * still in here, so no entry has to carry a cursor between lines: nothing can be left
     * half-open, and a line another script inserts cannot desynchronise anything.
     */
    const recent: string[] = [];
    let windowSize = 1;
    /** Bumped per line, so at most one entry gets to move the player per line. */
    let lineCounter = 0;
    let syncedAtLine = -1;

    client.Triggers.registerTrigger(/^/, (line, _matches, _type, originalLine) => {
        recent.push((originalLine ?? line.text).trim());
        while (recent.length > windowSize) {
            recent.shift();
        }
        lineCounter++;
        return undefined;
    });

    function lineMatches(gpsLine: GpsLine, text: string): boolean {
        return "literal" in gpsLine ? text.includes(gpsLine.literal) : gpsLine.pattern.test(text);
    }

    /**
     * Walk the entry's earlier lines backwards from the current one. They have to sit
     * directly behind it, which is the same strict sequence the per-entry cursor used
     * to enforce and the only one the Mudlet package can express.
     */
    function matchesWindow(entry: CompiledGps): boolean {
        let idx = recent.length - 1;
        for (let i = entry.lines.length - 2; i >= 0; i--) {
            idx--;
            if (idx < 0 || !lineMatches(entry.lines[i], recent[idx])) {
                return false;
            }
        }
        return true;
    }

    function checkContext(entry: CompiledGps): boolean {
        if (entry.areaName && client.Map.getAreaName(client.Map.currentRoom?.area.toString()) !== entry.areaName) {
            return false;
        }
        if (entry.withinRoomIds) {
            const id = client.Map.currentRoom?.id;
            if (!id || !entry.withinRoomIds.has(id)) {
                return false;
            }
        }
        return true;
    }

    function onMatch(entry: CompiledGps) {
        if (syncedAtLine === lineCounter || !checkContext(entry) || !matchesWindow(entry)) {
            return;
        }
        // Claim the line even when we are already standing there: a second entry sharing
        // this line lost the race, and letting it move the player would undo a good sync.
        syncedAtLine = lineCounter;
        if (client.Map.currentRoom?.id !== entry.roomId) {
            client.Map.setMapRoomById(entry.roomId);
            client.sendEvent('notify', {text: `Map Sync: gps ${entry.id}`});
        }
    }

    function register(entry: CompiledGps, tag: string) {
        const last = entry.lines[entry.lines.length - 1];
        if ("literal" in last) {
            // A token trigger is only *considered* on lines carrying its words in order, so
            // an entry costs nothing on the lines it could never match; the trigger itself
            // still settles it with the same substring test a plain string trigger runs.
            // The one thing this asks of a literal is that it start at a word boundary —
            // a fragment beginning inside a word would never reach its own bucket. Every
            // entry in the map is a pasted line or a whole clause, so none does.
            client.Triggers.registerTokenTrigger(last.literal, () => {
                onMatch(entry);
                return undefined;
            }, tag);
        } else {
            client.Triggers.registerTrigger(last.pattern, () => {
                onMatch(entry);
                return undefined;
            }, tag);
        }
    }

    /** Areas we currently hold triggers for, so they can be retired by tag. */
    const registered = new Map<number, CompiledGps[]>();

    /** Only ever as deep as the longest sequence any entry asks for — three lines, in today's map. */
    function resizeWindow() {
        let size = 1;
        for (const entries of registered.values()) {
            for (const entry of entries) {
                size = Math.max(size, entry.lines.length);
            }
        }
        windowSize = size;
        while (recent.length > windowSize) {
            recent.shift();
        }
    }

    /**
     * Rebuild one area's GPS triggers from scratch.
     *
     * Always clears first: an area arriving again means its rooms may have
     * gained, lost or changed `gps` entries, and stale triggers would keep
     * syncing the player to rooms that no longer claim those lines.
     */
    function rebuildArea(areaId: number) {
        client.Triggers.removeByTag(tagFor(areaId));
        registered.delete(areaId);

        const area = client.Map.tryGetMapReader()?.getArea(areaId);
        if (!area) {
            return;
        }
        const tag = tagFor(areaId);
        const entries = area.getRooms().flatMap(room => compile(room));
        entries.forEach(entry => register(entry, tag));
        registered.set(areaId, entries);
    }

    /**
     * Drop triggers for areas the map no longer has.
     *
     * Replacing the whole map announces only the *new* area ids, so an area
     * that disappeared would otherwise keep its triggers — and keep syncing the
     * player to room ids that no longer exist. Tags are exact, so nothing else
     * would ever clear them.
     */
    function pruneMissingAreas() {
        const reader = client.Map.tryGetMapReader();
        for (const areaId of [...registered.keys()]) {
            if (!reader?.getArea(areaId)) {
                client.Triggers.removeByTag(tagFor(areaId));
                registered.delete(areaId);
            }
        }
    }

    // One entry point for every way map data arrives: the initial load, a whole
    // map pushed from the editor, or a single area synced from it. The
    // subscription fires immediately for the already-loaded areas, so there is
    // no separate "first build" path to keep in step.
    client.Map.onAreasChanged(areaIds => {
        areaIds.forEach(rebuildArea);
        pruneMissingAreas();
        resizeWindow();
    });
}

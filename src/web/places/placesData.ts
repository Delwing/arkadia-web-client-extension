import { globalStorage } from "@modules/core/storage";
import { getRoomInfo } from "@modules/core/roomInfoProvider";
import { getAllNotes, type LocationNote } from "@modules/data/locationNotesStorage";
import { getEmbeddedMap } from "@web/embedRegistry.ts";

/**
 * Miejsca: a place is a room plus whatever the player keeps about it — the
 * /idz shortcut names pointing at it and their own note. The merge is only in
 * the UI: shortcuts stay in globalStorage 'shortcuts' (read by the client's
 * /idz and /prowadz), notes stay in ArkadiaLocationNotesDB (synced on their own).
 */

export interface ShortcutEntry {
    key: string;
    id: number;
    label: string;
}

export interface Place {
    roomId: number;
    shortcuts: ShortcutEntry[];
    note: LocationNote | null;
}

/** Shortcut names must survive `/idz <name>`: ASCII letters, digits and _, no spaces. */
export const SHORTCUT_KEY_RE = /^[a-zA-Z0-9_]+$/;

export const OPEN_PLACE_EVENT = "places-open";

export interface OpenPlaceDetail {
    roomId: number;
    /** Which field to put the cursor in. */
    focus?: "shortcut" | "note";
}

/** Open Miejsca on a room (hosts show the window; the window selects the room). */
export function openPlace(roomId: number, focus?: OpenPlaceDetail["focus"]) {
    window.dispatchEvent(new CustomEvent<OpenPlaceDetail>(OPEN_PLACE_EVENT, { detail: { roomId, focus } }));
}

export function readShortcuts(): ShortcutEntry[] {
    const saved = globalStorage.get("shortcuts") as unknown;
    const list = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
    return (list as ShortcutEntry[]).filter(s => s && typeof s.key === "string" && typeof s.id === "number");
}

export function writeShortcuts(list: ShortcutEntry[]) {
    globalStorage.set("shortcuts", list as any);
}

export async function loadPlaces(): Promise<Place[]> {
    const notes = await getAllNotes().catch(() => [] as LocationNote[]);
    const byRoom = new Map<number, Place>();
    const place = (roomId: number) => {
        let p = byRoom.get(roomId);
        if (!p) {
            p = { roomId, shortcuts: [], note: null };
            byRoom.set(roomId, p);
        }
        return p;
    };
    readShortcuts().forEach(s => place(s.id).shortcuts.push(s));
    notes.forEach(n => { place(n.id).note = n; });
    return [...byRoom.values()];
}

/** Room name and area from the map, falling back to what the note remembered. */
export function describeRoom(roomId: number, note?: LocationNote | null) {
    const info = getRoomInfo(roomId);
    return {
        name: info?.roomName || note?.roomName || `Lokacja #${roomId}`,
        area: info?.areaName || note?.areaName || "",
        mapNote: info?.mapNote ?? null,
    };
}

export interface MapRoomMatch {
    roomId: number;
    name: string;
    area: string;
}

/** Lowercase without diacritics, so "zolw" finds "Żółw". */
function fold(text: string) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split("\u0142").join("l");
}

/**
 * Rooms on the map matching a search, for places you are not standing in:
 * "#123" or "123" finds that room, otherwise the room or area name must
 * contain the text (at least 2 letters). Rooms in `exclude` are skipped.
 */
export function searchMapRooms(query: string, exclude: Set<number>, limit = 30): MapRoomMatch[] {
    const reader = getEmbeddedMap()?.reader;
    const q = query.trim();
    if (!reader || !q) return [];
    const id = /^#?\d+$/.test(q) ? parseInt(q.replace("#", ""), 10) : null;
    const areaNames = new Map<number, string>();
    reader.getAreas().forEach(a => areaNames.set(a.getAreaId(), a.getAreaName()));
    const toMatch = (room: MapData.Room): MapRoomMatch => ({
        roomId: room.id,
        name: room.name || `Lokacja #${room.id}`,
        area: areaNames.get(room.area) ?? "",
    });
    if (id !== null) {
        const room = reader.getRoom(id);
        return room && !exclude.has(id) ? [toMatch(room)] : [];
    }
    const needle = fold(q);
    if (needle.length < 2) return [];
    const found: MapRoomMatch[] = [];
    for (const room of reader.getRooms()) {
        if (exclude.has(room.id)) continue;
        const area = areaNames.get(room.area) ?? "";
        if (fold(room.name ?? "").includes(needle) || fold(area).includes(needle)) {
            found.push(toMatch(room));
            if (found.length >= limit) break;
        }
    }
    return found;
}

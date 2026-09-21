import { globalStorage } from "@modules/core/storage";
import { getRoomInfo } from "@modules/core/roomInfoProvider";
import { getAllNotes, type LocationNote } from "@modules/data/locationNotesStorage";

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

import { getEmbeddedMap } from '../embedRegistry';
import { getSnapshot as getNpcSnapshot } from '@modules/data/npcStore';

export interface RoomDescription {
    name: string;
    area: string;
}

/** The room's name and area as the map knows them, or null before the map loads or for an unknown room. */
export function describeRoom(roomId: number): RoomDescription | null {
    const reader = getEmbeddedMap()?.reader;
    const room = reader?.getRoom(roomId);
    if (!reader || !room) return null;
    const area = reader.getArea(room.area);
    return {
        name: room.name || `#${roomId}`,
        area: area?.getAreaName?.() ?? `Obszar ${room.area}`,
    };
}

/** The room the NPC database lists for this name, matched case-insensitively. */
export async function findNpcLocation(name: string): Promise<number | null> {
    const snapshot = await getNpcSnapshot().catch(() => undefined);
    const wanted = name.trim().toLowerCase();
    if (!snapshot || !wanted) return null;
    const npc = snapshot.all.data.find(entry => entry.name.toLowerCase() === wanted);
    return npc?.loc ?? null;
}

/** A room id typed by hand: a positive whole number, optionally prefixed with '#'. */
export function parseRoomId(value: string): number | null {
    const match = value.trim().match(/^#?(\d+)$/);
    if (!match) return null;
    const id = Number(match[1]);
    return id > 0 ? id : null;
}

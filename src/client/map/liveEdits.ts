import type {MapDataStore} from "./MapDataStore";
import type {ApplyChangesOptions, MapAreaData, RoomChange} from "./types";

/**
 * In-memory edits to the loaded map: whole areas swapped in place and single
 * rooms patched, created or removed. Each keeps the reader, its per-area
 * geometry and the store's lookups in step; re-rendering the current room and
 * announcing the change is left to the caller ({@link MapHelper}).
 *
 * Edits are memory-only and vanish when map data reloads.
 */

/** Rebuild the renderer's cached geometry and exits for one area. */
function rebuildArea(area: any): void {
    area.planes = area.createPlanes();
    area.exits = new Map();
    area.createExits();
    area.markDirty();
}

/**
 * Replace whole areas of the loaded map in place, and rebuild the pathfinder
 * when any were. See {@link MapHelper.syncAreas}.
 *
 * @returns the ids of the areas replaced.
 */
export function syncAreas(store: MapDataStore, areas: MapAreaData[]): number[] {
    if (!store.reader || areas.length === 0) {
        return [];
    }
    const reader: any = store.reader as any;
    const rooms: Record<number, MapData.Room> = reader.rooms;
    const syncedAreaIds: number[] = [];

    for (const incoming of areas) {
        const areaId = typeof incoming.areaId === "number" ? incoming.areaId : parseInt(incoming.areaId, 10);
        const wrapped = reader.areas?.[areaId];
        if (!wrapped?.area) {
            continue;
        }

        // Retire the outgoing rooms from every index that points at them.
        for (const room of wrapped.area.rooms ?? []) {
            delete rooms[room.id];
            if (room.hash) {
                delete store.hashes[room.hash];
            }
            const internalId = room.userData?.internal_id;
            if (internalId) {
                delete store.internalIds[internalId];
            }
        }

        // MapReader negates y when it first builds the map, so incoming data
        // in source orientation has to be flipped the same way here.
        const nextRooms = (incoming.rooms ?? []).map(room => ({...room, y: -room.y}));

        wrapped.area.rooms = nextRooms;
        // No labels given means keep the ones the area has: rooms are readable
        // through the plugin API, labels are not, so a caller adding rooms
        // could not pass them back.
        wrapped.area.labels = incoming.labels ?? wrapped.area.labels ?? [];
        if (incoming.areaName) {
            wrapped.area.areaName = incoming.areaName;
            store.areas[areaId] = incoming.areaName;
        }

        for (const room of nextRooms) {
            rooms[room.id] = room;
            if (room.hash) {
                store.hashes[room.hash] = room.id;
            }
            const internalId = room.userData?.internal_id;
            if (internalId) {
                store.internalIds[internalId] = room.id;
            }
        }

        rebuildArea(wrapped);
        syncedAreaIds.push(areaId);
    }

    if (syncedAreaIds.length > 0) {
        store.rebuildPathFinder();
    }
    return syncedAreaIds;
}

/**
 * Drop a room from the live map.
 *
 * The reader keeps each room in two places that must stay in step: its
 * `rooms` lookup and the owning area's `rooms` array — the same object in
 * both, which is what the area's `createPlanes()` rebuilds from.
 */
function removeRoomLive(
    store: MapDataStore,
    rooms: Record<number, MapData.Room>,
    roomId: number,
    affectedAreas: Set<number>,
): boolean {
    const room = rooms[roomId];
    if (!room) {
        return false;
    }
    const area: any = (store.reader as any).areas?.[room.area];
    const areaRooms: MapData.Room[] | undefined = area?.area?.rooms;
    if (areaRooms) {
        const index = areaRooms.findIndex(candidate => candidate.id === roomId);
        if (index !== -1) {
            areaRooms.splice(index, 1);
        }
    }
    delete rooms[roomId];
    if (room.hash) {
        delete store.hashes[room.hash];
    }
    const internalId = room.userData?.internal_id;
    if (internalId) {
        delete store.internalIds[internalId];
    }
    affectedAreas.add(room.area);
    return true;
}

/**
 * Add a room to the live map, registering it in both places the reader
 * tracks rooms. Returns undefined when the target area is unknown, since a
 * room outside any area would never be drawn.
 */
function createRoomLive(
    store: MapDataStore,
    rooms: Record<number, MapData.Room>,
    change: RoomChange,
): MapData.Room | undefined {
    const areaId = change.area;
    if (areaId === undefined) {
        return undefined;
    }
    const area: any = (store.reader as any).areas?.[areaId];
    const areaRooms: MapData.Room[] | undefined = area?.area?.rooms;
    if (!areaRooms) {
        return undefined;
    }

    // Field values arrive via the normal patch pass below; this is only a
    // well-formed shell so the renderer never sees a half-built room.
    const room = {
        id: change.roomId,
        area: areaId,
        x: 0,
        y: 0,
        z: 0,
        weight: 1,
        roomChar: "",
        name: "",
        env: 0,
        hash: "",
        userData: {},
        customLines: {},
        stubs: [],
        exits: {},
        doors: {},
        specialExits: {},
    } as unknown as MapData.Room;

    rooms[change.roomId] = room;
    areaRooms.push(room);
    return room;
}

/** Write the fields `change` carries onto `room`. @returns whether anything changed. */
function patchRoom(store: MapDataStore, room: MapData.Room, change: RoomChange): boolean {
    let touched = false;

    if (change.name !== undefined && change.name !== room.name) {
        room.name = change.name;
        touched = true;
    }
    if (change.roomChar !== undefined && change.roomChar !== room.roomChar) {
        room.roomChar = change.roomChar;
        touched = true;
    }
    if (change.env !== undefined && change.env !== room.env) {
        room.env = change.env;
        touched = true;
    }
    if (change.weight !== undefined && change.weight !== room.weight) {
        room.weight = change.weight;
        touched = true;
    }
    // Coordinates feed the per-area geometry, so a move needs the area
    // rebuild below to actually shift on screen.
    if (change.x !== undefined && change.x !== room.x) {
        room.x = change.x;
        touched = true;
    }
    if (change.y !== undefined && change.y !== room.y) {
        room.y = change.y;
        touched = true;
    }
    if (change.z !== undefined && change.z !== room.z) {
        room.z = change.z;
        touched = true;
    }
    if (change.exits) {
        room.exits = {...change.exits} as Record<MapData.direction, number>;
        touched = true;
    }
    if (change.specialExits) {
        room.specialExits = {...change.specialExits};
        touched = true;
    }
    if (change.customLines) {
        room.customLines = {...change.customLines};
        touched = true;
    }
    if (change.userData) {
        room.userData ||= {};
        for (const [key, value] of Object.entries(change.userData)) {
            const previous = room.userData[key];
            if (value === null) {
                delete room.userData[key];
            } else {
                room.userData[key] = value;
            }
            // internal_id feeds a lookup index built at load time, so it
            // has to be kept in step or getRoomIdByInternalId resolves an
            // id the room no longer advertises. Retire the old entry
            // before adding the new one, and read the previous value
            // *before* the mutation above overwrites it.
            if (key === "internal_id") {
                if (previous && store.internalIds[previous] === change.roomId) {
                    delete store.internalIds[previous];
                }
                if (value !== null) {
                    store.internalIds[value] = change.roomId;
                }
            }
        }
        touched = true;
    }
    return touched;
}

/**
 * Apply room edits to the loaded map and rebuild the area geometry and
 * pathfinder they invalidate (as `options` allows). See
 * {@link MapHelper.applyRoomChanges}.
 *
 * @returns how many rooms changed, and the areas they are in.
 */
export function applyRoomChanges(
    store: MapDataStore,
    changes: RoomChange[],
    options?: ApplyChangesOptions,
): { changed: number; affectedAreas: number[] } {
    if (!store.reader || changes.length === 0) {
        return {changed: 0, affectedAreas: []};
    }
    const rooms: Record<number, MapData.Room> = (store.reader as any).rooms;
    const affectedAreas = new Set<number>();
    let changed = 0;

    for (const change of changes) {
        const op = change.op ?? "patch";

        if (op === "delete") {
            if (removeRoomLive(store, rooms, change.roomId, affectedAreas)) {
                changed++;
            }
            continue;
        }

        let room = rooms[change.roomId];
        if (!room && op === "upsert") {
            room = createRoomLive(store, rooms, change) as MapData.Room;
            if (room) {
                changed++;
                affectedAreas.add(room.area);
            }
        }
        if (!room) {
            continue;
        }

        if (patchRoom(store, room, change)) {
            changed++;
            affectedAreas.add(room.area);
        }
    }

    if (changed === 0) {
        return {changed: 0, affectedAreas: []};
    }

    if (options?.rebuildAreas !== false) {
        const areas: Record<number, any> = (store.reader as any).areas;
        for (const areaId of affectedAreas) {
            const area = areas[areaId];
            if (!area) {
                continue;
            }
            rebuildArea(area);
        }
    }
    if (options?.rebuildPaths !== false) {
        store.rebuildPathFinder();
    }
    return {changed, affectedAreas: [...affectedAreas]};
}

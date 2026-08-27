// The set of rooms a carriage cannot enter.
//
// Held per user for now: nobody has this data yet, so the first job is to gather it. The store is
// deliberately a plain sorted id list so a collected set can be read out with /wozbloki and later
// promoted into shipped data without a migration.
//
// Global rather than character-scoped: a wagon cannot climb those stairs whoever is driving.

import { globalStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';

const STORAGE_KEY = 'carriage_blocked_rooms';

let cache: Set<number> | null = null;

function load(): Set<number> {
    if (!cache) {
        const stored = globalStorage.get(STORAGE_KEY);
        cache = new Set(Array.isArray(stored) ? stored.filter(id => Number.isFinite(id)) : []);
    }
    return cache;
}

function persist(rooms: Set<number>) {
    // Kept sorted in memory as well as in storage, so anything iterating the set - the map markers,
    // the listing - reads the same stable order.
    const sorted = [...rooms].sort((a, b) => a - b);
    cache = new Set(sorted);
    globalStorage.set(STORAGE_KEY, sorted);
    eventBus.emit('carriageBlocks.changed');
}

/** Every room currently marked as barred to a carriage. */
export function getBlockedRooms(): ReadonlySet<number> {
    return load();
}

export function isBlocked(roomId: number): boolean {
    return load().has(roomId);
}

/** Mark a room. Returns false when it was already marked. */
export function blockRoom(roomId: number): boolean {
    const rooms = new Set(load());
    if (rooms.has(roomId)) return false;
    rooms.add(roomId);
    persist(rooms);
    return true;
}

/** Unmark a room. Returns false when it was not marked. */
export function unblockRoom(roomId: number): boolean {
    const rooms = new Set(load());
    if (!rooms.delete(roomId)) return false;
    persist(rooms);
    return true;
}

export function clearBlockedRooms() {
    persist(new Set());
}

/** Replace the whole set, for importing a list someone else gathered. */
export function setBlockedRooms(roomIds: Iterable<number>) {
    persist(new Set([...roomIds].filter(id => Number.isFinite(id))));
}

/** Forget the in-memory copy, so the next read comes from storage. For tests and device sync. */
export function resetBlockedRoomsCache() {
    cache = null;
}

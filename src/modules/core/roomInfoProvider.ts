export interface RoomInfo {
    roomName: string;
    areaName: string;
    mapNote: string | null;
}

type RoomInfoLookup = (roomId: number) => RoomInfo | null;

let provider: RoomInfoLookup | null = null;

export function registerRoomInfoProvider(fn: RoomInfoLookup): void {
    provider = fn;
}

export function getRoomInfo(roomId: number): RoomInfo | null {
    return provider?.(roomId) ?? null;
}

/** Steps from the current room to each room: 0 when already there, null without a path. */
type RoomDistanceLookup = (roomIds: readonly number[]) => Map<number, number | null>;

let distanceProvider: RoomDistanceLookup | null = null;

export function registerRoomDistanceProvider(fn: RoomDistanceLookup): void {
    distanceProvider = fn;
}

/** Steps from the current room to `roomId`: 0 when already there, null without a path. */
export function getRoomDistance(roomId: number): number | null {
    return getRoomDistances([roomId]).get(roomId) ?? null;
}

/**
 * Steps from the current room to each of `roomIds`, in one search - never loop
 * getRoomDistance over many rooms, each call is a search of the whole map.
 */
export function getRoomDistances(roomIds: readonly number[]): Map<number, number | null> {
    return distanceProvider?.(roomIds) ?? new Map(roomIds.map((id) => [id, null]));
}

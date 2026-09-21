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

/** Steps from the current room to `roomId`: 0 when already there, null without a path. */
type RoomDistanceLookup = (roomId: number) => number | null;

let distanceProvider: RoomDistanceLookup | null = null;

export function registerRoomDistanceProvider(fn: RoomDistanceLookup): void {
    distanceProvider = fn;
}

export function getRoomDistance(roomId: number): number | null {
    return distanceProvider?.(roomId) ?? null;
}

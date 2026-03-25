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

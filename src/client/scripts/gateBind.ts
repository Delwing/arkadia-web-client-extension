/**
 * Shared helpers for the gate ("wrota") bind.
 *
 * A location that sits in front of a gate carries a `gate` entry in its map
 * userData holding the command that opens/knocks on that particular gate
 * (`brama` is accepted as an alias). When it is missing, the generic knock is
 * used.
 */

export const DEFAULT_GATE_COMMAND = 'uderz we wrota';

interface RoomLike {
    userData?: Record<string, string>;
}

/** The raw gate command stored on the room, if any. */
function rawGateCommand(room: RoomLike | null | undefined): string | null {
    const raw = room?.userData?.gate ?? room?.userData?.brama;
    return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/** Whether the room is a gate location (has a `gate` userData entry). */
export function isGateRoom(room: RoomLike | null | undefined): boolean {
    return rawGateCommand(room) !== null;
}

/**
 * Bind string for the gate in the given room: `userData.gate` when set,
 * the default knock otherwise. The result may use the regular bind syntax
 * (`cmd#cmd*delay`), so run it through `MapHelper.executeBind`.
 */
export function getGateBindString(room: RoomLike | null | undefined): string {
    return rawGateCommand(room) ?? DEFAULT_GATE_COMMAND;
}

interface TrackedRoom extends RoomLike {
    id?: number;
}

/**
 * Tracks movement between gate locations. The gate bind is only offered when
 * the player walks *into* a gate location from a regular one - coming from
 * another gate location means the gate has just been crossed, so there is
 * nothing left to knock on.
 *
 * Feed every room the player enters; repeated calls for the same room keep the
 * earlier verdict. Each consumer keeps its own tracker instance.
 */
export function createGateEntryTracker() {
    let lastRoomId: number | null = null;
    let lastRoomHadGate = false;
    let show = false;

    return {
        /** Feed the entered room; returns whether the gate bind should surface. */
        update(room: TrackedRoom | null | undefined): boolean {
            const roomId = typeof room?.id === 'number' ? room.id : null;
            const hasGate = isGateRoom(room);
            if (roomId !== lastRoomId) {
                show = hasGate && !lastRoomHadGate;
                lastRoomHadGate = hasGate;
                lastRoomId = roomId;
                return show;
            }
            // Same location re-rendered - keep the earlier verdict, drop it only
            // if the gate data itself is gone.
            show = show && hasGate;
            return show;
        },
    };
}

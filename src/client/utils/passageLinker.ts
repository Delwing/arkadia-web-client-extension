import Client from "../Client";
import type {RoomChange} from "@shared/map/MapHelper";

export interface PassageLinkerOptions {
    /** Room the passage leads into. */
    target: number;
    /** Direction from the entrance room down to the target. */
    direction: MapData.direction;
    /** Direction leading from the target back to the entrance. */
    reverse: MapData.direction;
    /**
     * Every room the passage is known to turn up in. Only one of them holds it
     * at a time, so linking one drops the stale links on the rest.
     */
    candidates?: readonly number[];
    /**
     * Command that actually walks `direction`, when plain "w dol" will not do it.
     * It lands both as a special exit — so the mapper follows the move — and as a
     * dir_bind on `direction`, so typing the direction sends the command instead.
     */
    enterCommand?: string;
    /** The same, for `reverse` on the target room. */
    leaveCommand?: string;
    /**
     * Area the entrance must sit in. The lines that announce these passages are
     * ordinary enough prose to turn up elsewhere in the world, and linking the
     * wrong room also unlinks the right one, so the zone is worth checking.
     */
    entranceArea?: number;
}

export interface PassageLinker {
    /** Links `entranceId` to the target both ways. Returns true when the map changed. */
    link(entranceId: number): boolean;

    /** Room linked to the target in this session, if any. */
    linkedId(): number | null;
}

function readDirBinds(room: MapData.Room): Map<string, string> {
    const binds = new Map<string, string>();
    const raw: string = (room.userData as any)?.dir_bind ?? "";
    for (const item of raw.split("&")) {
        const [dir, ...rest] = item.split("=");
        if (dir && rest.length > 0) {
            binds.set(dir, rest.join("="));
        }
    }
    return binds;
}

/**
 * One direction of a room's dir_bind set or (with a null command) cleared, leaving
 * the rest alone. Null back means the room is left with no dir_bind at all, which is
 * how {@link RoomChange.userData} spells "remove this key".
 */
function withDirBind(room: MapData.Room, direction: string, command: string | null): string | null {
    const binds = readDirBinds(room);
    if (command === null) {
        binds.delete(direction);
    } else {
        binds.set(direction, command);
    }
    const joined = Array.from(binds, ([dir, cmd]) => `${dir}=${cmd}`).join("&");
    return joined || null;
}

/**
 * A passage that moves around between visits — a hole in a cave floor, a slab the
 * swamp uncovers, a wreck the silt shifts off — is not something the shipped map can
 * describe: it would have to show every possible entrance at once. So the map is
 * patched as the passage is found, for this session only, and the entrance that wins
 * takes the link away from whoever held it before.
 *
 * The patch goes through applyRoomChanges rather than straight into the reader: the
 * renderer caches each area's geometry, so a room mutated behind its back keeps its
 * old exits on screen until something announces the area changed — which is the last
 * thing applyRoomChanges does.
 */
export function createPassageLinker(client: Client, options: PassageLinkerOptions): PassageLinker {
    const {target, direction, reverse, candidates = [], enterCommand, leaveCommand, entranceArea} = options;
    let linked: number | null = null;

    return {
        linkedId: () => linked,

        link(entranceId: number): boolean {
            const reader = client.Map.tryGetMapReader() as any;
            if (!reader || entranceId === target) {
                return false;
            }
            const rooms: Record<number, MapData.Room> = reader.rooms;
            const entrance = rooms[entranceId];
            const targetRoom = rooms[target];
            if (!entrance || !targetRoom) {
                return false;
            }
            if (entranceArea !== undefined && entrance.area !== entranceArea) {
                return false;
            }
            const alreadyLinked = entrance.exits[direction] === target
                && targetRoom.exits[reverse] === entranceId
                && (!enterCommand || entrance.specialExits?.[enterCommand] === target)
                && (!leaveCommand || targetRoom.specialExits?.[leaveCommand] === entranceId);
            if (alreadyLinked) {
                linked = entranceId;
                return false;
            }

            const changes: RoomChange[] = [];

            const stale = new Set<number>(candidates);
            if (linked !== null) {
                stale.add(linked);
            }
            stale.delete(entranceId);
            for (const id of stale) {
                const room = rooms[id];
                if (!room || room.exits[direction] !== target) {
                    continue;
                }
                const exits = {...room.exits};
                delete exits[direction];
                const change: RoomChange = {roomId: id, exits};
                if (enterCommand && room.specialExits?.[enterCommand] === target) {
                    const specialExits = {...room.specialExits};
                    delete specialExits[enterCommand];
                    change.specialExits = specialExits;
                }
                if (enterCommand && readDirBinds(room).get(direction) === enterCommand) {
                    change.userData = {dir_bind: withDirBind(room, direction, null)};
                }
                changes.push(change);
            }

            const entranceChange: RoomChange = {
                roomId: entranceId,
                exits: {...entrance.exits, [direction]: target},
            };
            if (enterCommand) {
                entranceChange.specialExits = {...entrance.specialExits, [enterCommand]: target};
                entranceChange.userData = {dir_bind: withDirBind(entrance, direction, enterCommand)};
            }
            changes.push(entranceChange);

            const targetChange: RoomChange = {
                roomId: target,
                exits: {...targetRoom.exits, [reverse]: entranceId},
            };
            if (leaveCommand) {
                targetChange.specialExits = {...targetRoom.specialExits, [leaveCommand]: entranceId};
                targetChange.userData = {dir_bind: withDirBind(targetRoom, reverse, leaveCommand)};
            }
            changes.push(targetChange);

            // rerender off: the redraw that matters is the area refresh applyRoomChanges
            // announces, and the position has not moved. Re-emitting enterLocation would
            // fire a second time inside the very handler that called this.
            if (client.Map.applyRoomChanges(changes, {rerender: false}) === 0) {
                return false;
            }
            // Paths, highlights and the location label still read from the map that just
            // changed, so refresh them - silently, for the same reason.
            const currentId = client.Map.currentRoom?.id;
            if (currentId !== undefined) {
                client.Map.renderRoomByIdSilently(currentId);
            }
            linked = entranceId;
            return true;
        },
    };
}

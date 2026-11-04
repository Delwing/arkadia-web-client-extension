import type {MapReader} from "mudlet-map-renderer";
import {directionToStub, getLongDir, getShortDir, isPolishDirection} from "@shared/map/directions.ts";

/**
 * Working out which exit a step takes, from the map alone: what a typed
 * direction really leads to, where a step lands, and which exit a team follow
 * names. Pure - nothing here moves the mapper.
 */

const directionDeltas = {
    north: {x: 0, y: -1, z: 0},
    south: {x: 0, y: 1, z: 0},
    east: {x: 1, y: 0, z: 0},
    west: {x: -1, y: 0, z: 0},
    northwest: {x: -1, y: -1, z: 0},
    northeast: {x: 1, y: -1, z: 0},
    southwest: {x: -1, y: 1, z: 0},
    southeast: {x: 1, y: 1, z: 0},
    up: {x: 0, y: 0, z: 1},
    down: {x: 0, y: 0, z: -1},
};

/** Whether `targetRoom` lies `targetDir` (a long direction) of `room`, in the same area. */
export function findRoomByExit(room: MapData.Room, targetRoom: MapData.Room, targetDir: string) {
    if (room.area !== targetRoom.area) {
        return false;
    }

    const delta = directionDeltas[targetDir];
    if (!delta) {
        return false;
    }
    const dx = targetRoom.x - room.x;
    const dy = targetRoom.y - room.y;
    const dz = targetRoom.z - room.z;

    const check = (d: number, expected: number) => {
        if (expected === 0) {
            return d === 0;
        }
        return expected > 0 ? d > 0 : d < 0;
    };

    return check(dx, delta.x) && check(dy, delta.y) && check(dz, delta.z);
}

/**
 * What the map believes actually leads `direction` from `room`, without moving.
 *
 * The literal exit wins when it exists. Otherwise a special exit whose target sits that way is
 * preferred, then any exit whose target sits that way — so "w" still works in a room whose
 * only westward exit is recorded as "nw" or as a special-exit command. Returns `direction`
 * unchanged when nothing better is known, or when the room has an unexplored stub that way:
 * the game says that exit exists, so a regular exit merely drawn in that direction must not
 * steal it. A special exit drawn that way still wins over the stub, as in Mudlet (19034: sw
 * stub, "zejdz na dol" lands south-west), and so does an up/down exit (8264: w stub, "down"
 * lands west).
 */
export function resolveDirection(reader: MapReader, direction: string, room: MapData.Room): string {
    const potentialExit = getLongDir(direction);
    if (room.exits?.[potentialExit]) return direction;

    const leadsThatWay = ([, id]: [string, number]) =>
        findRoomByExit(room, reader.getRoom(id), potentialExit);

    const specialExitMatch = Object.entries(room.specialExits ?? {})
        .filter(leadsThatWay)
        .map(([exit]) => exit);
    if (specialExitMatch.length > 0) return getShortDir(specialExitMatch[0]);

    // Mudlet's up/down translation ignores stubs too (8264: w stub, "down" lands west).
    const verticalMatch = (["up", "down"] as const)
        .filter(exit => room.exits?.[exit] && leadsThatWay([exit, room.exits[exit]]));
    if (verticalMatch.length > 0) return getShortDir(verticalMatch[0]);

    const stub = directionToStub(potentialExit);
    if (stub !== undefined && room.stubs?.includes(stub)) return direction;

    const allExits = Object.assign({}, room.exits ?? {}, room.specialExits ?? {});
    const exits = Object.entries(allExits).filter(leadsThatWay).map(([exit]) => exit);
    return exits.length > 0 ? getShortDir(exits[0]) : direction;
}

/**
 * Where a step `direction` from `room` lands, as move() would take it, without
 * moving. A direction the map knows by another name is a step only when it is
 * not a team follow: move() sends the right command instead, and that command
 * is the step. Undefined when the room has no such way out.
 *
 * `resolve` is the mapper's own {@link resolveDirection}, which also knows
 * whether the map is paused.
 */
export function stepTarget(
    resolve: (direction: string, room: MapData.Room) => string,
    room: MapData.Room,
    direction: string,
    isTeamFollow: boolean,
): number | undefined {
    const actual = resolve(direction, room);
    if (actual !== direction && isTeamFollow) return undefined;
    const allExits: Record<string, number> = Object.assign({}, room.exits ?? {}, room.specialExits ?? {});
    return allExits[getLongDir(actual)];
}

/**
 * The exit a team follow `direction` takes from `room`, as followMove() picks
 * it: a compass word, then a special exit named in it or by most of its name,
 * then the room's `team_follow_link` keywords.
 */
export function followExit(
    resolve: (direction: string, room: MapData.Room) => string,
    room: MapData.Room,
    direction: string,
    fullFollow?: string,
): string | undefined {
    const leads = (exit: string) => stepTarget(resolve, room, exit, true) !== undefined;
    // The follow token comes from game prose, so only attempt a bare
    // directional move when it is a full Polish direction word. Otherwise a
    // preposition like "w" (in "w lesna gestwine") would be resolved to the
    // short code for "west". Configured exits in specialExits /
    // team_follow_link below are still resolved normally.
    if (isPolishDirection(direction) && leads(direction)) return direction;

    const specials = Object.keys(room.specialExits ?? {});
    const named = specials.find(ex => direction.includes(ex) && leads(ex));
    if (named !== undefined) return named;
    const partly = specials.find(ex => direction.includes(ex.substring(0, Math.round(ex.length * 0.7))) && leads(ex));
    if (partly !== undefined) return partly;

    const links = room.userData?.team_follow_link;
    if (links) {
        for (const entry of links.split("#")) {
            const [search, exit] = entry.split("*");
            if (!search || !exit) continue;
            // Either the follow token itself or the wider follow text may carry the keyword.
            // fullFollow is optional — the carriage and boat triggers pass only a direction —
            // so it has to be probed defensively.
            if ((direction.includes(search) || fullFollow?.includes(search)) && leads(exit)) return exit;
        }
    }
    return undefined;
}

/** The command that leaves `room` for `targetId`, or null when there is no such exit. */
export function exitCommandTo(room: MapData.Room | undefined, targetId: number): string | null {
    if (!room) return null;
    for (const [direction, id] of Object.entries(room.exits ?? {})) {
        if (id === targetId) return getShortDir(direction);
    }
    for (const [exit, id] of Object.entries(room.specialExits ?? {})) {
        if (id === targetId) return exit;
    }
    return null;
}

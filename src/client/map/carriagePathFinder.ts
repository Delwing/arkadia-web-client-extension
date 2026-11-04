// A journey made partly by carriage, seen from the wagon's point of view: which rooms are driven,
// where the wagon has to be left, and what is walked from there.
//
// The routing itself belongs to the shared planner in transportPathFinder.ts, which searches the
// driving and walking layers together; this only reads its answer back in the terms the carriage
// scripts speak - a drive leg, a transfer point and a foot leg.

import type { MapReader } from "mudlet-map-renderer";
import { planRoute, type RouteSegment } from "./transportPathFinder";

export { DRIVE_WEIGHT } from "./transportPathFinder";

export interface CarriageRoute {
    /** Rooms to drive from here, transfer point last. Just the start when the wagon cannot help. */
    drive: number[];
    /** Rooms walked once the wagon is left, transfer point first. Just the transfer point when the wagon gets all the way. */
    walk: number[];
    /** Where the wagon is finally left. Equals the destination when it can be taken the whole way. */
    transfer: number;
    /** True when the destination itself is barred to a wagon. */
    destinationBlocked: boolean;
    /** Rooms driven in total, which a ride in the middle can split into several legs. */
    driveRooms: number;
    /** Rooms walked in total, once the wagon is behind us. */
    walkRooms: number;
    /** True when the journey goes on after the wagon is left. */
    leftToTravel: boolean;
    /** The first ship boarded on foot after the wagon is left, if any. */
    boarding: string | null;
}

/**
 * Read a planned route as a carriage journey.
 *
 * The wagon is left at the end of the last leg travelled on it - which need not be a drive, since a
 * ship will carry it across - and everything after that point is on foot. There is no getting back
 * on, so that point is the one transfer of the journey.
 */
export function describeCarriageRoute(
    segments: RouteSegment[],
    fromId: number,
    toId: number,
    blocked: ReadonlySet<number>,
): CarriageRoute {
    let transfer = fromId;
    let lastOnWagon = -1;
    let driveRooms = 0;
    segments.forEach((segment, index) => {
        if (segment.kind === "drive") {
            transfer = segment.rooms[segment.rooms.length - 1];
            driveRooms += segment.rooms.length - 1;
            lastOnWagon = index;
        } else if (segment.kind === "transport" && segment.withWagon) {
            transfer = segment.toRoomId;
            lastOnWagon = index;
        }
    });

    // What to drive now: only the stretch we are standing at the start of.
    const first = segments[0];
    const drive = first && first.kind === "drive" ? first.rooms : [fromId];

    const next = segments[lastOnWagon + 1];
    const walk = next && next.kind === "walk" ? next.rooms : [transfer];
    const onFoot = segments.slice(lastOnWagon + 1);
    const ride = onFoot.find(segment => segment.kind === "transport");

    return {
        drive,
        walk,
        transfer,
        destinationBlocked: blocked.has(toId),
        driveRooms,
        walkRooms: onFoot.reduce(
            (total, segment) => segment.kind === "walk" ? total + segment.rooms.length - 1 : total,
            0,
        ),
        leftToTravel: onFoot.length > 0,
        boarding: ride && ride.kind === "transport" ? ride.transportName : null,
    };
}

/**
 * Plan a journey that starts on a wagon, and read it back as its legs.
 *
 * Returns null only when the destination cannot be reached on foot either - a blocked destination
 * is a normal answer, not a failure.
 */
export function planCarriageRoute(
    reader: MapReader,
    blocked: ReadonlySet<number>,
    fromId: number,
    toId: number,
): CarriageRoute | null {
    // Nowhere to go, so the wagon stays exactly where it is.
    if (fromId === toId) return describeCarriageRoute([], fromId, toId, blocked);
    const segments = planRoute(reader, fromId, toId, { carriageBlocked: blocked });
    if (!segments) return null;
    return describeCarriageRoute(segments, fromId, toId, blocked);
}

// One route planner for every way of getting somewhere: on foot, on a wagon, or aboard a ship or
// coach. It is a single Dijkstra over a graph with two layers - driving and walking - joined by a
// one-way "leave the wagon here" edge, so a journey that drives to a dock, leaves the wagon, sails
// and then walks the last few rooms falls out of one search rather than being stitched together
// from several.
//
// The layers exist because a wagon cannot go everywhere a person can: the driving layer omits the
// rooms marked as barred and the exits nobody can take while sitting down, and it charges less per
// room, since driving covers ground faster. Rides belong to both layers - a wagon can be taken
// aboard a ship - so the wagon is only ever left where it genuinely cannot follow.

import type { MapReader } from "mudlet-map-renderer";
import type { TransportDef } from "@client/scripts/transports/definitions";
import { longToShort } from "./directions";
import { isDrivableExit } from "./exitCommands";

// Boarding penalty represents the expected wait at a dock (transports run on
// schedule, so on average you wait half a cycle). Set high enough that a
// single direct transport beats a 2-leg transfer even when total in-vehicle
// time is similar — transfers also incur extra walking between docks.
const BOARDING_PENALTY = 30;
const TIME_TO_HOP_RATIO = 0.5;
const DEFAULT_TRANSPORT_TIME = 60;

/**
 * What leaving the wagon costs.
 *
 * Nothing, in practice - but a hair more than nothing, so that a route which can be driven and an
 * equally good one on foot are not decided by whatever order the heap happens to be in. You are
 * sitting on a wagon; on a tie, ride.
 */
const DISMOUNT_COST = 1e-9;

/**
 * What one driven room costs relative to one walked room.
 *
 * Driving covers ground faster, so the search prefers to travel by wagon wherever that helps. The
 * value also bounds how far it will detour: at 0.5 the wagon will add two rooms of driving to save
 * one room of walking, but no more, which rules out riding around a mountain to save a few steps.
 */
export const DRIVE_WEIGHT = 0.5;

// Mudlet exitLocks store direction indices (1..12) that resolve to long-form
// direction names. Mirrors the table in mudlet-map-renderer's MapGraph.
const EXIT_LOCK_DIRECTIONS: Record<number, string> = {
    1: "north",
    2: "northeast",
    3: "northwest",
    4: "east",
    5: "west",
    6: "south",
    7: "southeast",
    8: "southwest",
    9: "up",
    10: "down",
    11: "in",
    12: "out",
};

function resolveWalkWeight(
    fromRoom: { exitWeights?: Record<string, number> },
    weightKey: string,
    toRoom: { weight?: number },
): number {
    const override = fromRoom.exitWeights?.[weightKey];
    if (typeof override === "number" && override > 0) return override;
    const targetWeight = typeof toRoom.weight === "number" ? toRoom.weight : 1;
    return Math.max(targetWeight, 1);
}

export interface TransportHop {
    transportName: string;
    boardCommands: string[];
    exitCommand?: string;
    fromRoomId: number;
    toRoomId: number;
    label?: string;
    timeSeconds?: number;
    /** Intermediate stop room IDs the vehicle passes through without the user disembarking. */
    viaStops?: Array<{ roomId: number; label?: string }>;
}

export type RouteSegment =
    | { kind: "walk"; rooms: number[] }
    | { kind: "drive"; rooms: number[] }
    | ({ kind: "transport"; /** True when the wagon is taken aboard rather than left behind. */ withWagon: boolean } & TransportHop);

export interface RoutePlanOptions {
    /** Transports that may be boarded on the way; none by default, for a journey on foot. */
    defs?: TransportDef[];
    /** Rooms a wagon may not enter, when the journey starts on one; null or absent when it does not. */
    carriageBlocked?: ReadonlySet<number> | null;
    /** Override the per-hop boarding penalty (default: schedule-wait estimate). */
    boardingPenalty?: number;
    /** Override the seconds-to-walking-weight conversion (default: 1 s ~ 1 room). */
    timeToHopRatio?: number;
}

interface Edge {
    to: number;
    cost: number;
    hop?: TransportHop;
}

class MinHeap {
    private heap: Array<{ id: number; dist: number }> = [];

    push(id: number, dist: number) {
        this.heap.push({ id, dist });
        this.bubbleUp(this.heap.length - 1);
    }

    pop(): { id: number; dist: number } | undefined {
        if (this.heap.length === 0) return undefined;
        const top = this.heap[0];
        const last = this.heap.pop()!;
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this.bubbleDown(0);
        }
        return top;
    }

    get size() {
        return this.heap.length;
    }

    private bubbleUp(i: number) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.heap[parent].dist <= this.heap[i].dist) break;
            [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
            i = parent;
        }
    }

    private bubbleDown(i: number) {
        const n = this.heap.length;
        while (true) {
            const l = 2 * i + 1;
            const r = 2 * i + 2;
            let smallest = i;
            if (l < n && this.heap[l].dist < this.heap[smallest].dist) smallest = l;
            if (r < n && this.heap[r].dist < this.heap[smallest].dist) smallest = r;
            if (smallest === i) break;
            [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
            i = smallest;
        }
    }
}

/**
 * Exits a wagon cannot take, worked out from the map itself.
 *
 * A multi-word special exit is an action rather than a place - "wejdz na skaly" - and you cannot
 * perform one while sitting on a wagon; the game refuses with "Nie mozesz tego zrobic, gdyz
 * siedzisz." So those edges are barred to a carriage without anyone having to mark them.
 *
 * An edge is only barred when the same room offers no drivable way to that same target, since a
 * room may record both "north" and "wejdz na gore" leading to one place.
 */
function collectUndrivableEdges(reader: MapReader): Set<string> {
    const undrivable = new Set<string>();
    for (const room of reader.getRooms()) {
        const specialExits = (room as { specialExits?: Record<string, number> }).specialExits;
        if (!specialExits) continue;

        const drivableTargets = new Set<number>(Object.values(room.exits ?? {}) as number[]);
        for (const [exit, target] of Object.entries(specialExits)) {
            if (isDrivableExit(exit)) drivableTargets.add(target);
        }
        for (const [exit, target] of Object.entries(specialExits)) {
            if (!isDrivableExit(exit) && !drivableTargets.has(target)) {
                undrivable.add(`${room.id}->${target}`);
            }
        }
    }
    return undrivable;
}

/**
 * Rooms and the exits between them, as walked. Built once per map: which rooms are barred to a
 * wagon and which transports run only affect the search, never this graph.
 */
function buildWalkGraph(reader: MapReader): Map<number, Edge[]> {
    const graph = new Map<number, Edge[]>();
    const add = (from: number, edge: Edge) => {
        const list = graph.get(from);
        if (list) list.push(edge);
        else graph.set(from, [edge]);
    };

    for (const room of reader.getRooms()) {
        const lockedExitDirs = new Set(
            (room.exitLocks ?? [])
                .map(idx => EXIT_LOCK_DIRECTIONS[idx])
                .filter((d): d is string => !!d),
        );
        const lockedSpecialTargets = new Set(room.mSpecialExitLocks ?? []);

        for (const [dir, targetId] of Object.entries(room.exits ?? {})) {
            if (typeof targetId !== "number") continue;
            if (lockedExitDirs.has(dir)) continue;
            const targetRoom = reader.getRoom(targetId);
            if (!targetRoom) continue;
            const weightKey = longToShort[dir] ?? dir;
            const cost = resolveWalkWeight(room, weightKey, targetRoom);
            add(room.id, { to: targetId, cost });
        }
        for (const [exitName, targetId] of Object.entries(room.specialExits ?? {})) {
            if (typeof targetId !== "number") continue;
            if (lockedSpecialTargets.has(targetId)) continue;
            const targetRoom = reader.getRoom(targetId);
            if (!targetRoom) continue;
            const cost = resolveWalkWeight(room, exitName, targetRoom);
            add(room.id, { to: targetId, cost });
        }
    }

    return graph;
}

/**
 * Virtual edges for the rides themselves: one per contiguous sub-route on the same vehicle (a
 * "ride through" several stops without disembarking). The boarding penalty is paid once per ride,
 * so Dijkstra naturally prefers staying onboard over exit-and-reboard.
 */
function buildTransportGraph(
    defs: TransportDef[],
    boardingPenalty: number,
    timeToHopRatio: number,
): Map<number, Edge[]> {
    const graph = new Map<number, Edge[]>();
    const add = (from: number, edge: Edge) => {
        const list = graph.get(from);
        if (list) list.push(edge);
        else graph.set(from, [edge]);
    };

    for (const def of defs) {
        const stops = def.stops;
        const n = stops.length;
        if (n === 0) continue;

        for (let i = 0; i < n; i++) {
            const startStop = stops[i];
            const fromRoomId = startStop.start;
            const intermediates: Array<{ roomId: number; label?: string }> = [];
            let cumulativeTime = 0;
            let chainContinuesFrom = startStop.start;

            for (let offset = 0; offset < n; offset++) {
                const stop = stops[(i + offset) % n];
                // Chain must stay connected: previous destination == this start.
                if (stop.start !== chainContinuesFrom) break;
                const legTime = typeof stop.time === "number" && stop.time > 0 ? stop.time : DEFAULT_TRANSPORT_TIME;
                cumulativeTime += legTime;
                const toRoomId = stop.destination;

                // Skip the round-trip back to where we boarded.
                if (toRoomId === fromRoomId) break;

                const hop: TransportHop = {
                    transportName: def.name,
                    boardCommands: def.boardCommands,
                    exitCommand: def.exitCommand,
                    fromRoomId,
                    toRoomId,
                    label: stop.label,
                    timeSeconds: cumulativeTime,
                    viaStops: intermediates.length > 0 ? [...intermediates] : undefined,
                };
                const cost = cumulativeTime * timeToHopRatio + boardingPenalty;
                add(fromRoomId, { to: toRoomId, cost, hop });

                intermediates.push({ roomId: toRoomId, label: stop.label });
                chainContinuesFrom = toRoomId;
            }
        }
    }

    return graph;
}

// Both graphs are pure functions of their inputs and expensive to build on a full map, so they are
// kept rather than rebuilt - a route is replanned on every step of a journey by wagon.
const walkGraphs = new WeakMap<MapReader, Map<number, Edge[]>>();
const undrivableEdges = new WeakMap<MapReader, ReadonlySet<string>>();
const transportGraphs = new WeakMap<TransportDef[], Map<string, Map<number, Edge[]>>>();

function walkGraphFor(reader: MapReader): Map<number, Edge[]> {
    let graph = walkGraphs.get(reader);
    if (!graph) {
        graph = buildWalkGraph(reader);
        walkGraphs.set(reader, graph);
    }
    return graph;
}

function undrivableFor(reader: MapReader): ReadonlySet<string> {
    let edges = undrivableEdges.get(reader);
    if (!edges) {
        edges = collectUndrivableEdges(reader);
        undrivableEdges.set(reader, edges);
    }
    return edges;
}

function transportGraphFor(
    defs: TransportDef[],
    boardingPenalty: number,
    timeToHopRatio: number,
): Map<number, Edge[]> {
    let byOptions = transportGraphs.get(defs);
    if (!byOptions) {
        byOptions = new Map();
        transportGraphs.set(defs, byOptions);
    }
    const key = `${boardingPenalty}:${timeToHopRatio}`;
    let graph = byOptions.get(key);
    if (!graph) {
        graph = buildTransportGraph(defs, boardingPenalty, timeToHopRatio);
        byOptions.set(key, graph);
    }
    return graph;
}

/** Rooms are keyed by their id while walking, and by the negative of it while driving. */
const drivingKey = (roomId: number) => -(roomId + 1);
const roomOf = (key: number) => (key < 0 ? -key - 1 : key);
const isDriving = (key: number) => key < 0;

interface PathStep {
    from: number;
    hop?: TransportHop;
}

/**
 * The way from one room to another, as the legs it is made of: rooms driven, rooms walked, and
 * rides taken.
 *
 * Returns null when there is no way there at all, and an empty list when there is nowhere to go.
 */
export function planRoute(
    reader: MapReader,
    fromId: number,
    toId: number,
    options: RoutePlanOptions = {},
): RouteSegment[] | null {
    if (fromId === toId) return [];

    const walkGraph = walkGraphFor(reader);
    if (!walkGraph.has(fromId)) return null;
    const defs = options.defs ?? [];
    const transportGraph = defs.length > 0
        ? transportGraphFor(
            defs,
            options.boardingPenalty ?? BOARDING_PENALTY,
            options.timeToHopRatio ?? TIME_TO_HOP_RATIO,
        )
        : null;
    const blocked = options.carriageBlocked ?? null;
    const undrivable = blocked ? undrivableFor(reader) : null;

    // Where we already are counts even when a wagon is not allowed to be there.
    const start = blocked ? drivingKey(fromId) : fromId;
    const dist = new Map<number, number>([[start, 0]]);
    const prev = new Map<number, PathStep>();
    const heap = new MinHeap();
    heap.push(start, 0);

    let end: number | null = null;
    while (heap.size > 0) {
        const { id: key, dist: d } = heap.pop()!;
        if (d > (dist.get(key) ?? Infinity)) continue;
        const room = roomOf(key);
        if (room === toId) {
            end = key;
            break;
        }

        const relax = (nextKey: number, cost: number, hop?: TransportHop) => {
            const next = d + cost;
            if (next < (dist.get(nextKey) ?? Infinity)) {
                dist.set(nextKey, next);
                prev.set(nextKey, { from: key, hop });
                heap.push(nextKey, next);
            }
        };

        if (isDriving(key)) {
            for (const edge of walkGraph.get(room) ?? []) {
                if (blocked!.has(edge.to)) continue;
                if (undrivable!.has(`${room}->${edge.to}`)) continue;
                relax(drivingKey(edge.to), edge.cost * DRIVE_WEIGHT);
            }
            // The wagon comes aboard, so we are still driving when the ship ties up.
            for (const edge of transportGraph?.get(room) ?? []) {
                relax(drivingKey(edge.to), edge.cost, edge.hop);
            }
            // Leaving the wagon behind - the only way between the layers, and one-way: whatever is
            // left of the journey from here on is made on foot.
            relax(room, DISMOUNT_COST);
        } else {
            for (const edge of walkGraph.get(room) ?? []) {
                relax(edge.to, edge.cost);
            }
            for (const edge of transportGraph?.get(room) ?? []) {
                relax(edge.to, edge.cost, edge.hop);
            }
        }
    }

    if (end === null) return null;

    const steps: Array<{ from: number; to: number; driving: boolean; hop?: TransportHop }> = [];
    let cursor = end;
    while (cursor !== start) {
        const step = prev.get(cursor);
        if (!step) return null;
        steps.unshift({
            from: roomOf(step.from),
            to: roomOf(cursor),
            // A step belongs to the layer it stays in; dismounting leaves the driving one.
            driving: isDriving(step.from) && isDriving(cursor),
            hop: step.hop,
        });
        cursor = step.from;
    }

    const segments: RouteSegment[] = [];
    let buffer: number[] = [];
    let bufferKind: "walk" | "drive" = "walk";
    const flush = () => {
        if (buffer.length >= 2) segments.push({ kind: bufferKind, rooms: buffer });
        buffer = [];
    };

    for (const step of steps) {
        if (step.from === step.to) continue; // leaving the wagon: a change of layer, not of place
        if (step.hop) {
            flush();
            segments.push({ kind: "transport", withWagon: step.driving, ...step.hop });
            continue;
        }
        const kind = step.driving ? "drive" : "walk";
        if (kind !== bufferKind) {
            flush();
            bufferKind = kind;
        }
        if (buffer.length === 0) buffer.push(step.from);
        buffer.push(step.to);
    }
    flush();

    return segments;
}

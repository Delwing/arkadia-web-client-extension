// Routing for a journey made partly by carriage. A wagon cannot enter every room a person can, so
// a trip to a blocked destination - a room inside a building, say - is two legs: drive as far as
// the wagon can usefully go, leave it there, walk the rest.
//
// The room to leave the wagon in is what the search actually solves for. It cannot be found by
// walking the on-foot route until it turns blocked, because the drivable route may never touch
// that route at all. Instead one reverse pass from the destination gives the walking distance from
// every room in the world, and one forward pass from the start gives the driving distance to every
// room a wagon can reach; the transfer point is the room that minimises the two together.

import { MapGraph } from "mudlet-map-renderer";
import type { MapReader } from "mudlet-map-renderer";
import { isDrivableExit } from "./exitCommands";

/**
 * What one driven room costs relative to one walked room.
 *
 * Driving covers ground faster, so the search prefers to travel by wagon wherever that helps. The
 * value also bounds how far it will detour: at 0.5 the wagon will add two rooms of driving to save
 * one room of walking, but no more, which rules out riding around a mountain to save a few steps.
 */
export const DRIVE_WEIGHT = 0.5;

export interface CarriageRoute {
    /** Rooms driven, start first, transfer point last. Just the start when the wagon cannot help. */
    drive: number[];
    /** Rooms walked, transfer point first, destination last. Just the transfer point when the wagon gets all the way. */
    walk: number[];
    /** Where to leave the wagon. Equals the destination when the whole trip is drivable. */
    transfer: number;
    /** True when the destination itself is barred to a wagon. */
    destinationBlocked: boolean;
}

interface Edge {
    id: number;
    weight: number;
}

class MinHeap {
    private heap: Array<{ id: number; dist: number }> = [];

    push(id: number, dist: number) {
        this.heap.push({ id, dist });
        let i = this.heap.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.heap[parent].dist <= this.heap[i].dist) break;
            [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
            i = parent;
        }
    }

    pop(): { id: number; dist: number } | undefined {
        if (this.heap.length === 0) return undefined;
        const top = this.heap[0];
        const last = this.heap.pop()!;
        if (this.heap.length > 0) {
            this.heap[0] = last;
            let i = 0;
            for (;;) {
                const left = i * 2 + 1;
                const right = left + 1;
                let smallest = i;
                if (left < this.heap.length && this.heap[left].dist < this.heap[smallest].dist) smallest = left;
                if (right < this.heap.length && this.heap[right].dist < this.heap[smallest].dist) smallest = right;
                if (smallest === i) break;
                [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
                i = smallest;
            }
        }
        return top;
    }

    get size() {
        return this.heap.length;
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
 * Dijkstra over an adjacency map, optionally pretending a set of rooms - and a set of edges - does
 * not exist. Returns the distance to every reachable room and the step taken to reach it.
 */
function search(
    adjacency: Map<number, Edge[]>,
    startId: number,
    blocked?: ReadonlySet<number>,
    undrivable?: ReadonlySet<string>,
): { dist: Map<number, number>; step: Map<number, number> } {
    const dist = new Map<number, number>([[startId, 0]]);
    const step = new Map<number, number>();
    const heap = new MinHeap();
    heap.push(startId, 0);

    while (heap.size > 0) {
        const { id, dist: d } = heap.pop()!;
        if (d > (dist.get(id) ?? Infinity)) continue;
        for (const edge of adjacency.get(id) ?? []) {
            if (blocked?.has(edge.id)) continue;
            if (undrivable?.has(`${id}->${edge.id}`)) continue;
            const next = d + edge.weight;
            if (next < (dist.get(edge.id) ?? Infinity)) {
                dist.set(edge.id, next);
                step.set(edge.id, id);
                heap.push(edge.id, next);
            }
        }
    }
    return { dist, step };
}

/** Follow predecessors back from `toId` to `startId`, returning the path in travel order. */
function traceBack(step: Map<number, number>, startId: number, toId: number): number[] {
    const path = [toId];
    let cursor = toId;
    while (cursor !== startId) {
        const previous = step.get(cursor);
        if (previous === undefined) return [];
        path.push(previous);
        cursor = previous;
    }
    return path.reverse();
}

/**
 * Follow the reverse search's steps forward from `startId` to `endId`.
 *
 * A search run backwards from the destination records, for each room, the room it was reached
 * from - which in the forward direction is the next step towards that destination. So this walks
 * out in travel order already and must not be reversed.
 */
function traceForward(step: Map<number, number>, startId: number, endId: number): number[] {
    const path = [startId];
    let cursor = startId;
    while (cursor !== endId) {
        const next = step.get(cursor);
        if (next === undefined) return [];
        path.push(next);
        cursor = next;
    }
    return path;
}

/**
 * Plans carriage journeys over one map.
 *
 * The adjacency is built once and reused for every query: which rooms are barred to a wagon only
 * affects the search, never the graph, so marking a room costs nothing. The graph comes from the
 * renderer's own MapGraph so exit locks, exit weights and room weights behave exactly as they do
 * when walking.
 */
export class CarriageRouter {
    private readonly adjacency: Map<number, Edge[]>;
    private readonly reversed: Map<number, Edge[]>;
    /** "from->to" pairs a wagon cannot take, derived from the map rather than gathered. */
    private readonly undrivable: Set<string>;

    constructor(reader: MapReader) {
        this.adjacency = new MapGraph(reader).getAdj();
        this.reversed = new Map();
        for (const [id, edges] of this.adjacency) {
            for (const edge of edges) {
                const back = this.reversed.get(edge.id);
                const entry = { id, weight: edge.weight };
                if (back) back.push(entry);
                else this.reversed.set(edge.id, [entry]);
            }
        }
        this.undrivable = collectUndrivableEdges(reader);
    }

    /**
     * Split a journey into a driven leg and a walked leg.
     *
     * Returns null only when the destination cannot be reached on foot either - a blocked
     * destination is a normal answer, not a failure.
     */
    findRoute(blocked: ReadonlySet<number>, fromId: number, toId: number): CarriageRoute | null {
        const destinationBlocked = blocked.has(toId);
        if (fromId === toId) {
            return { drive: [fromId], walk: [toId], transfer: fromId, destinationBlocked };
        }

        // How far every room is from the destination on foot, and the next step towards it. Walking
        // ignores the blocked set entirely - it only ever constrains the wagon.
        const onFoot = search(this.reversed, toId);
        if (!onFoot.dist.has(fromId)) return null;

        // How far the wagon can get, and by which route. The start counts even when it is barred,
        // since that is where we already are.
        const byWagon = search(this.adjacency, fromId, blocked, this.undrivable);

        let transfer = fromId;
        let best = Infinity;
        let bestWalked = Infinity;
        let bestDriven = Infinity;
        for (const [roomId, driven] of byWagon.dist) {
            const walked = onFoot.dist.get(roomId);
            if (walked === undefined) continue;
            const cost = DRIVE_WEIGHT * driven + walked;
            // Ties go to whichever leaves less walking - you are in a wagon, so ride. Driving four
            // rooms costs exactly as much as walking two, and on that tie the point of the exercise
            // is to be carried. Only a further tie prefers the shorter drive, so an equally good
            // transfer point is never reached the long way round.
            const better = cost !== best
                ? cost < best
                : walked !== bestWalked
                    ? walked < bestWalked
                    : driven < bestDriven;
            if (better) {
                best = cost;
                bestWalked = walked;
                bestDriven = driven;
                transfer = roomId;
            }
        }

        const drive = transfer === fromId ? [fromId] : traceBack(byWagon.step, fromId, transfer);
        const walk = transfer === toId ? [toId] : traceForward(onFoot.step, transfer, toId);
        if (drive.length === 0 || walk.length === 0) return null;
        return { drive, walk, transfer, destinationBlocked };
    }
}

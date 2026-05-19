// Transport-augmented Dijkstra. Walks the room-exit graph plus virtual edges
// for each transport stop (start -> destination, weight = travel time +
// boarding penalty), returning the result as a list of walk + transport
// segments so callers can render and execute them.

import type { MapReader } from "mudlet-map-renderer";
import type { TransportDef } from "@client/scripts/transports/definitions";
import { longToShort } from "./directions";

// Boarding penalty represents the expected wait at a dock (transports run on
// schedule, so on average you wait half a cycle). Set high enough that a
// single direct transport beats a 2-leg transfer even when total in-vehicle
// time is similar — transfers also incur extra walking between docks.
const BOARDING_PENALTY = 30;
const TIME_TO_HOP_RATIO = 0.5;
const DEFAULT_TRANSPORT_TIME = 60;

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

export type TransportPathSegment =
    | { kind: "walk"; rooms: number[] }
    | ({ kind: "transport" } & TransportHop);

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

export interface TransportPathOptions {
    /** Override the per-hop boarding penalty (default: schedule-wait estimate). */
    boardingPenalty?: number;
    /** Override the seconds-to-walking-weight conversion (default: 1 s ≈ 1 room). */
    timeToHopRatio?: number;
}

function buildGraph(reader: MapReader, defs: TransportDef[], opts?: TransportPathOptions): Map<number, Edge[]> {
    const boardingPenalty = opts?.boardingPenalty ?? BOARDING_PENALTY;
    const timeToHopRatio = opts?.timeToHopRatio ?? TIME_TO_HOP_RATIO;
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

    // For each transport, emit edges for every contiguous sub-route on the same
    // vehicle (a "ride through" several stops without disembarking). The
    // boarding penalty is paid once per ride, so Dijkstra naturally prefers
    // staying onboard over exit-and-reboard.
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

interface PathStep {
    prev: number;
    hop?: TransportHop;
}

export function findTransportPath(
    reader: MapReader,
    defs: TransportDef[],
    fromId: number,
    toId: number,
    options?: TransportPathOptions,
): TransportPathSegment[] | null {
    if (fromId === toId) return [];

    const graph = buildGraph(reader, defs, options);
    if (!graph.has(fromId)) return null;

    const dist = new Map<number, number>();
    const prev = new Map<number, PathStep>();
    dist.set(fromId, 0);

    const heap = new MinHeap();
    heap.push(fromId, 0);

    while (heap.size > 0) {
        const { id, dist: d } = heap.pop()!;
        if (id === toId) break;
        if (d > (dist.get(id) ?? Infinity)) continue;

        const edges = graph.get(id);
        if (!edges) continue;
        for (const edge of edges) {
            const next = d + edge.cost;
            if (next < (dist.get(edge.to) ?? Infinity)) {
                dist.set(edge.to, next);
                prev.set(edge.to, { prev: id, hop: edge.hop });
                heap.push(edge.to, next);
            }
        }
    }

    if (!prev.has(toId)) return null;

    interface Step {
        from: number;
        to: number;
        hop?: TransportHop;
    }
    const steps: Step[] = [];
    let cursor = toId;
    while (cursor !== fromId) {
        const p = prev.get(cursor);
        if (!p) return null;
        steps.unshift({ from: p.prev, to: cursor, hop: p.hop });
        cursor = p.prev;
    }

    const segments: TransportPathSegment[] = [];
    let walkBuffer: number[] = [];

    const flushWalk = () => {
        if (walkBuffer.length >= 2) {
            segments.push({ kind: "walk", rooms: walkBuffer });
        }
        walkBuffer = [];
    };

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (step.hop) {
            if (walkBuffer.length > 0) {
                walkBuffer.push(step.from);
                flushWalk();
            }
            segments.push({ kind: "transport", ...step.hop });
            walkBuffer = [];
        } else {
            if (walkBuffer.length === 0) {
                walkBuffer.push(step.from);
            }
            walkBuffer.push(step.to);
        }
    }
    flushWalk();

    return segments;
}

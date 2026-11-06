import {stepTarget} from "./exitResolution";

/** A bare look around, which the game answers with a room.info like a step. */
export const LOOK_COMMAND = /^(?:l|sp|spojrz|zerknij)$/;

/**
 * Something sent to the game that will be answered by one `gmcp.room.info`: a step
 * the player took, or a bare look around.
 */
export type ShadowEntry =
    | { kind: 'step'; direction: string; at: number }
    | { kind: 'look'; at: number };

/** What happened, as {@link StepShadow} saw it. */
export type ShadowEventType =
    /** A step or look was sent and is waiting for the game's answer. */
    | 'queued'
    /** A room.info answered the oldest step. */
    | 'confirmed'
    /** A room.info answered the oldest look. */
    | 'look'
    /** The game refused the oldest step (a blocker, no such exit, a cooldown). */
    | 'rejected'
    /** A room.info nothing was waiting for: a teleport, a script, a ride. */
    | 'unexpected'
    /** A refusal with no step waiting for it. */
    | 'unmatched-reject'
    /** The queue was started over: the map was placed, a team follow moved us, or steps went unanswered. */
    | 'reset';

export interface ShadowReport {
    type: ShadowEventType;
    /** The entry the event is about, when there is one. */
    entry?: ShadowEntry;
    /** For `rejected` / `unmatched-reject`: what refused it. For `reset`: why. */
    source?: string;
    /** Where the shadow believes we are: the confirmed room plus every pending step. */
    shadowRoom: number | undefined;
    /** The last room the game has confirmed. */
    confirmedRoom: number | undefined;
    /** Where the map says we are. */
    mapRoom: number | undefined;
    /** The room GMCP named, when the map knows it. Only on room.info events. */
    gmcpRoom?: number;
    /** Steps and looks still waiting for an answer. */
    pending: number;
    /** True when the shadow and the map disagree about where we are. */
    diverged: boolean;
    /**
     * Only on `confirmed`: the room the confirmed step should have reached from the
     * confirmed room differs from the one GMCP named.
     */
    gmcpDisagrees?: boolean;
}

export interface StepShadowDeps {
    getRoom(id: number): MapData.Room | undefined;
    resolve(direction: string, room: MapData.Room): string;
    mapRoomId(): number | undefined;
    now?(): number;
}

/** A step this long without an answer is taken as lost, and the queue starts over. */
export const SHADOW_STALE_MS = 10_000;

/**
 * An experiment running beside the mapper, changing nothing: every step and look
 * the player sends waits in a queue (first in, first out) for the game's answer.
 * A `gmcp.room.info` answers the oldest one; a blocker or a refusal cancels the
 * oldest step. Where we stand is then the last room the game confirmed plus every
 * step still waiting, taken again from there.
 *
 * Reports what it makes of each event, and whether it disagrees with the map, so
 * it can be watched in play before anything relies on it.
 */
export class StepShadow {
    private readonly queue: ShadowEntry[] = [];
    private confirmed: number | undefined;
    private listeners = new Set<(report: ShadowReport) => void>();
    /** Set while a room.info is applied, so the map's own fix is not taken as a placement. */
    private inRoomInfo = false;

    constructor(private readonly deps: StepShadowDeps) {}

    onReport(listener: (report: ShadowReport) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    get pending(): readonly ShadowEntry[] {
        return this.queue;
    }

    get confirmedRoom(): number | undefined {
        return this.confirmed;
    }

    /** The confirmed room with every pending step taken again from it. */
    get shadowRoom(): number | undefined {
        let id = this.confirmed;
        for (const entry of this.queue) {
            if (id === undefined) return undefined;
            if (entry.kind !== 'step') continue;
            const room = this.deps.getRoom(id);
            const target = room ? stepTarget(this.deps.resolve, room, entry.direction, false) : undefined;
            // A step the room has no exit for stays put: the game will most likely refuse it.
            if (target !== undefined) id = target;
        }
        return id;
    }

    /**
     * The player sent a step `direction` (as the map resolved it). `fromRoomId` is where
     * the map stood before it - the room to start from when nothing is known yet.
     */
    step(direction: string, fromRoomId: number | undefined): void {
        this.dropStale();
        if (this.queue.length === 0) this.confirmed ??= fromRoomId;
        const entry: ShadowEntry = {kind: 'step', direction, at: this.now()};
        this.queue.push(entry);
        this.report('queued', {entry});
    }

    /** The player looked around: the game answers with a room.info that is not a step. */
    look(): void {
        this.dropStale();
        const entry: ShadowEntry = {kind: 'look', at: this.now()};
        this.queue.push(entry);
        this.report('queued', {entry});
    }

    /**
     * Run the map's own handling of a room.info, then answer the oldest entry with it.
     * `gmcpRoom` is the room GMCP named, when the map knows it.
     */
    roomInfo(gmcpRoom: number | undefined, applyToMap: () => void): void {
        this.inRoomInfo = true;
        try {
            applyToMap();
        } finally {
            this.inRoomInfo = false;
        }
        this.dropStale();
        const entry = this.queue.shift();
        if (!entry) {
            this.confirmed = gmcpRoom ?? this.deps.mapRoomId();
            this.report('unexpected', {gmcpRoom});
            return;
        }
        if (entry.kind === 'look') {
            if (gmcpRoom !== undefined) this.confirmed = gmcpRoom;
            this.report('look', {entry, gmcpRoom});
            return;
        }
        const from = this.confirmed !== undefined ? this.deps.getRoom(this.confirmed) : undefined;
        const expected = from ? stepTarget(this.deps.resolve, from, entry.direction, false) : undefined;
        const gmcpDisagrees = gmcpRoom !== undefined && expected !== undefined && gmcpRoom !== expected;
        // GMCP's word wins when the map knows the room; otherwise the step is taken from the map.
        this.confirmed = gmcpRoom ?? expected;
        this.report('confirmed', {entry, gmcpRoom, gmcpDisagrees});
    }

    /** The game refused a step: the oldest one waiting is the one it refused. */
    reject(source: string): void {
        this.dropStale();
        const index = this.queue.findIndex(entry => entry.kind === 'step');
        if (index === -1) {
            this.report('unmatched-reject', {source});
            return;
        }
        const [entry] = this.queue.splice(index, 1);
        this.report('rejected', {entry, source});
    }

    /** A team follow moved us. The map takes those from the game's prose, which is always right. */
    follow(): void {
        this.resetTo(this.deps.mapRoomId(), 'follow');
    }

    /** Someone who knows better put the map in `roomId`: /ustaw, the GPS, a labyrinth mapper. */
    placed(roomId: number): void {
        if (this.inRoomInfo) return;
        this.resetTo(roomId, 'placed');
    }

    private resetTo(roomId: number | undefined, reason: string): void {
        const hadPending = this.queue.length > 0;
        const moved = roomId !== this.confirmed;
        this.queue.length = 0;
        this.confirmed = roomId;
        if (hadPending || moved) this.report('reset', {source: reason});
    }

    private dropStale(): void {
        const oldest = this.queue[0];
        if (oldest && this.now() - oldest.at > SHADOW_STALE_MS) {
            this.queue.length = 0;
            this.confirmed = this.deps.mapRoomId();
            this.report('reset', {source: 'stale'});
        }
    }

    private now(): number {
        return this.deps.now?.() ?? Date.now();
    }

    private report(type: ShadowEventType, extra: Partial<ShadowReport> = {}): void {
        if (this.listeners.size === 0) return;
        const shadowRoom = this.shadowRoom;
        const mapRoom = this.deps.mapRoomId();
        const report: ShadowReport = {
            type,
            shadowRoom,
            confirmedRoom: this.confirmed,
            mapRoom,
            pending: this.queue.length,
            diverged: shadowRoom !== undefined && mapRoom !== undefined && shadowRoom !== mapRoom,
            ...extra,
        };
        for (const listener of this.listeners) listener(report);
    }
}

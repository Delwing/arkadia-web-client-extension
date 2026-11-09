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
    /**
     * Only on `confirmed` / `look`: entries older than the one GMCP answered, dropped
     * because the game evidently refused them without a line the shadow knows.
     */
    skipped?: ShadowEntry[];
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
 * GMCP coordinates the map knows are the game's own word on where we are, so they
 * always win: that room becomes the confirmed one, and the queue is lined up with
 * it - the entry answered is the first that leads there, and anything older was
 * refused by a line the shadow does not know. Only a room.info the map cannot place
 * falls back on answering the oldest entry blindly.
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
    /** Set while the map is moved on the shadow's behalf, or in step with it: nothing to hear. */
    private mapMovesAreOurs = false;
    /** When a command that is neither a step nor a look last went to the game. */
    private lastOtherAt: number | undefined;

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
     * Run the map's own handling of a room.info, then answer a waiting entry with it.
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
        if (gmcpRoom !== undefined) {
            this.alignWithGmcp(gmcpRoom);
            return;
        }
        const entry = this.queue.shift();
        if (!entry) {
            this.confirmed = gmcpRoom ?? this.deps.mapRoomId();
            this.report('unexpected', {gmcpRoom});
            return;
        }
        if (entry.kind === 'look') {
            this.report('look', {entry});
            return;
        }
        // GMCP cannot place the room, so the step is taken from the map.
        this.confirmed = this.targetOf(entry);
        this.report('confirmed', {entry});
    }

    /**
     * GMCP put us in `gmcpRoom`. The entry it answers is the first one that, taken
     * from the confirmed room, lands there - the older ones were refused, or the
     * game would not be answering this one yet. When none does, the oldest is taken
     * as answered and the map's idea of that step is reported as wrong.
     */
    private alignWithGmcp(gmcpRoom: number): void {
        const index = this.queue.findIndex(entry => this.targetOf(entry) === gmcpRoom);
        if (index === -1) {
            const entry = this.queue.shift();
            this.confirmed = gmcpRoom;
            if (!entry) this.report('unexpected', {gmcpRoom});
            else if (entry.kind === 'look') this.report('look', {entry, gmcpRoom, gmcpDisagrees: true});
            else this.report('confirmed', {entry, gmcpRoom, gmcpDisagrees: true});
            return;
        }
        const skipped = this.queue.splice(0, index);
        const entry = this.queue.shift()!;
        this.confirmed = gmcpRoom;
        const extra = {entry, gmcpRoom, ...(skipped.length > 0 ? {skipped} : {})};
        this.report(entry.kind === 'look' ? 'look' : 'confirmed', extra);
    }

    /**
     * Where `entry` lands taken from the confirmed room: a look stays put. Undefined for
     * a step the map knows no exit for - the game answers that with a refusal, not a
     * room.info - and when the confirmed room itself is unknown.
     */
    private targetOf(entry: ShadowEntry): number | undefined {
        if (this.confirmed === undefined) return undefined;
        if (entry.kind === 'look') return this.confirmed;
        const from = this.deps.getRoom(this.confirmed);
        return from ? stepTarget(this.deps.resolve, from, entry.direction, false) : undefined;
    }

    /** A command that is neither a step nor a look went to the game. */
    other(): void {
        this.lastOtherAt = this.now();
    }

    /**
     * The game refused a step: the oldest one waiting is the one it refused.
     *
     * `ambiguous` is for a refusal the game also gives to commands that are not steps
     * ("Nie ma takiej komendy"): it only counts when nothing else went to the game
     * lately, or it could just as well be answering a typo sent before or after the
     * step. Passing on it costs little - the next room.info GMCP can place drops the
     * refused step anyway.
     */
    reject(source: string, options: { ambiguous?: boolean } = {}): void {
        this.dropStale();
        if (options.ambiguous && this.lastOtherAt !== undefined && this.now() - this.lastOtherAt <= SHADOW_STALE_MS) {
            this.report('unmatched-reject', {source: `${source}, niejednoznaczne`});
            return;
        }
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
        if (this.inRoomInfo || this.mapMovesAreOurs) return;
        this.resetTo(roomId, 'placed');
    }

    /**
     * The map stepped back a room because a script decided the last step failed (a
     * fall, a trap, /cofnij). The shadow takes the map's word for it and starts over
     * from there - unless the step back is one it already accounts for, see
     * {@link inStepWithMap}.
     */
    mapSteppedBack(): void {
        if (this.inRoomInfo || this.mapMovesAreOurs) return;
        this.resetTo(this.deps.mapRoomId(), 'cofniecie');
    }

    /**
     * Run `fn`, which moves the map in a way the shadow already knows about - a
     * blocker's step back it rejects itself, or a correction it asked for - so the
     * move is not taken as someone else's placement.
     */
    inStepWithMap(fn: () => void): void {
        const previous = this.mapMovesAreOurs;
        this.mapMovesAreOurs = true;
        try {
            fn();
        } finally {
            this.mapMovesAreOurs = previous;
        }
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

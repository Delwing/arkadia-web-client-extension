/**
 * Carries the room over when a character's game session moves to another device.
 *
 * Arkadia lets a login on a second device take the character over; the game drops
 * the first connection. The new device logs straight into the world, and without
 * this its map would show wherever that device last was, which in a team on the
 * move is soon a long way off.
 *
 * The device being left writes its room as it sees its session end (see
 * handoffRecord for the rules), and the device taking over picks it up: at once
 * if it is already there — a deliberate disconnect earlier — or while it waits a
 * few seconds after logging in, since the takeover happens on both ends at once.
 *
 * DOM- and Firebase-free: the browser wiring (src/web/sessionHandoff.ts) feeds it
 * game events and a store.
 */

import {
    claimRecord,
    inheritedRoom,
    takeoverRoom,
    TAKEOVER_WINDOW_MS,
    withHandoff,
    type SessionRecord,
} from './handoffRecord';

export interface HandoffStore {
    /** Server time, as best known. */
    now(): number;
    /**
     * Run a transaction on a character's record. Resolves to the committed value,
     * or `null` when the update aborted.
     */
    transact(
        character: string,
        update: (current: SessionRecord | null) => SessionRecord | null | undefined,
    ): Promise<SessionRecord | null>;
    watch(character: string, listener: (value: SessionRecord | null) => void): () => void;
    /** Hold the database connection open, or let it go. */
    setOnline(online: boolean): void;
}

export interface SessionHandoffDeps {
    deviceId: string;
    newSessionId(): string;
    /**
     * Whether this device has been awake to follow the character. A tab in the
     * background may have been frozen while the character moved, and a room from
     * it is a guess this would pass off as fact.
     */
    isTrusted(): boolean;
    /** Put the map in this room. */
    apply(roomId: number): void;
    setTimer(fn: () => void, ms: number): () => void;
}

export class SessionHandoff {
    private store: HandoffStore | null = null;
    private gameConnected = false;
    private pending = 0;

    private character: string | null = null;
    private session: string | null = null;
    private prevSession: string | null = null;
    private claimed = false;
    private endedSession: string | null = null;

    private room: number | null = null;
    private lost = false;

    /** Whether the map has moved on its own since this login; a handoff then comes too late. */
    private moved = false;
    private trackingMoves = false;
    private applying = false;
    private offerOpen = false;

    private stopWatch: (() => void) | null = null;
    private stopOfferTimer: (() => void) | null = null;
    private stopTrackingTimer: (() => void) | null = null;

    constructor(private readonly deps: SessionHandoffDeps) {}

    /** The signed-in user's store, or null when signed out. */
    setStore(store: HandoffStore | null): void {
        if (store === this.store) return;
        this.stopWatching();
        this.store?.setOnline(false);
        this.store = store;
        this.claimed = false;
        this.refreshOnline();
        this.claim();
    }

    connected(): void {
        this.gameConnected = true;
        this.refreshOnline();
    }

    disconnected(): void {
        this.gameConnected = false;
        this.closeOffer();
        this.refreshOnline();
    }

    /** A login, not a resumed connection. */
    sessionStarted(character: string): void {
        this.stopWatching();
        this.closeOffer();
        this.character = character;
        this.session = this.deps.newSessionId();
        this.prevSession = null;
        this.claimed = false;
        this.endedSession = null;
        this.moved = false;
        this.offerOpen = true;
        // The map restores this device's own last room in the same turn as the
        // login; that is not the player moving.
        this.trackingMoves = false;
        this.stopTrackingTimer?.();
        this.stopTrackingTimer = this.deps.setTimer(() => {
            this.stopTrackingTimer = null;
            this.trackingMoves = true;
        }, 0);
        this.claim();
    }

    roomChanged(roomId: number): void {
        this.room = roomId;
        if (this.trackingMoves && !this.applying) {
            this.moved = true;
            this.closeOffer();
        }
    }

    lostChanged(lost: boolean): void {
        this.lost = lost;
    }

    /**
     * This device saw its session end. Hand the room over if it can vouch for it.
     *
     * Safe to call more than once for the same session; the first call wins.
     */
    async sessionEnded(): Promise<void> {
        const store = this.store;
        const session = this.session;
        const character = this.character;
        const roomId = this.room;
        if (!store || !session || !character || roomId === null) return;
        if (this.endedSession === session) return;
        if (this.lost || !this.deps.isTrusted()) return;
        this.endedSession = session;
        const handoff = {from: session, device: this.deps.deviceId, roomId, at: store.now()};
        await this.run(store, () => store.transact(character, current => withHandoff(current, handoff, store.now())));
    }

    private claim(): void {
        const store = this.store;
        const character = this.character;
        const session = this.session;
        if (!store || !character || !session || this.claimed) return;
        this.claimed = true;
        let previous: SessionRecord | null = null;
        void this.run(store, async () => {
            const committed = await store.transact(character, current => {
                previous = current;
                return claimRecord(current, {session, device: this.deps.deviceId}, store.now());
            });
            if (store !== this.store || session !== this.session || !committed) return;
            this.prevSession = committed.prevSession;
            const inherited = inheritedRoom(previous, store.now());
            if (inherited !== null) {
                this.offer(inherited);
            } else if (this.offerOpen && this.prevSession) {
                this.stopOfferTimer = this.deps.setTimer(() => {
                    this.stopOfferTimer = null;
                    this.closeOffer();
                }, TAKEOVER_WINDOW_MS);
            } else {
                this.closeOffer();
            }
            this.stopWatch = store.watch(character, value => this.onRecord(value));
        });
    }

    private onRecord(value: SessionRecord | null): void {
        const session = this.session;
        if (!session) return;
        const room = takeoverRoom(value, session, this.prevSession);
        if (room !== null) {
            this.offer(room);
            return;
        }
        // Someone logged in over us: the socket may not have told us yet.
        if (value && value.session !== session && value.prevSession === session) {
            void this.sessionEnded();
        }
    }

    private offer(roomId: number): void {
        if (!this.offerOpen || this.moved) return;
        this.closeOffer();
        this.applying = true;
        try {
            this.deps.apply(roomId);
        } finally {
            this.applying = false;
        }
    }

    private closeOffer(): void {
        this.offerOpen = false;
        this.stopOfferTimer?.();
        this.stopOfferTimer = null;
    }

    private stopWatching(): void {
        this.stopWatch?.();
        this.stopWatch = null;
    }

    private async run<T>(store: HandoffStore, op: () => Promise<T>): Promise<T | undefined> {
        this.pending += 1;
        this.refreshOnline();
        try {
            return await op();
        } catch (error) {
            console.warn('[SessionHandoff]', error);
            return undefined;
        } finally {
            this.pending -= 1;
            if (store === this.store) this.refreshOnline();
        }
    }

    /**
     * Online only while there is a game session or a write in flight: the database
     * counts every open connection, and a tab left open all day is not playing.
     */
    private refreshOnline(): void {
        this.store?.setOnline(this.gameConnected || this.pending > 0);
    }
}

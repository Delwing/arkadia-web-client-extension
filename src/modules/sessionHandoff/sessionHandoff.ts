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
    type HandoffRoom,
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

/**
 * Every decision goes to the console. The handoff happens on two devices at once
 * and fails quietly by design, so this is the only way to see why it did not.
 */
function log(message: string, ...details: unknown[]): void {
    console.info(`[SessionHandoff] ${message}`, ...details);
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
    /** The game object we are, from the latest Char.Info. */
    private body: number | null = null;
    /** The game object this login put us in. */
    private loginBody: number | null = null;

    /**
     * Whether the map has been placed since this login settled: a step, a GMCP
     * fix, the GPS, /ustaw, a plugin. Any of them knows better than a handoff
     * that arrives after it, even one that only confirmed the room already shown.
     */
    private moved = false;
    private trackingMoves = false;
    private applying = false;
    private offerOpen = false;

    private stopWatch: (() => void) | null = null;
    private stopOfferTimer: (() => void) | null = null;

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
        this.loginBody = null;
        this.offerOpen = true;
        // The map restores this device's own last room from storage while the
        // login's Char.Info is handled; that is not a placement. charInfoHandled()
        // starts counting once it is done.
        this.trackingMoves = false;
        this.claim();
    }

    /**
     * A Char.Info has been handled in full. For a login's, that includes the map's
     * restore of this device's own last room, and every placement from here on is
     * news. Later ones only keep track of which game object we are.
     */
    charInfoHandled(objectNum: number | null): void {
        this.body = objectNum;
        if (!this.trackingMoves) {
            this.loginBody = objectNum;
            this.trackingMoves = true;
        }
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
        const objectNum = this.body;
        if (!session || !character || this.endedSession === session) return;
        if (!store) return log('session ended, not handing over: not signed in to Firebase');
        if (roomId === null) return log('session ended, not handing over: no room known');
        if (objectNum === null) return log('session ended, not handing over: game object unknown');
        if (this.lost) return log('session ended, not handing over: map position lost');
        if (!this.deps.isTrusted()) return log('session ended, not handing over: tab was in the background');
        this.endedSession = session;
        const handoff = {from: session, device: this.deps.deviceId, roomId, objectNum, at: store.now()};
        const written = await this.run(store, () => store.transact(character, current => withHandoff(current, handoff, store.now())));
        if (written?.handoff?.from === session) log(`handed over room ${roomId} (object ${objectNum})`);
        else log('session ended, handoff refused: another login claimed the character too long ago');
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
            if (inherited) {
                log(`claimed ${character}; found room ${inherited.roomId} left by the previous session`);
                this.offer(inherited);
            } else if (this.offerOpen && this.prevSession) {
                log(`claimed ${character}; waiting ${TAKEOVER_WINDOW_MS / 1000} s for the previous session to hand over`);
                this.stopOfferTimer = this.deps.setTimer(() => {
                    this.stopOfferTimer = null;
                    this.closeOffer();
                }, TAKEOVER_WINDOW_MS);
            } else {
                log(`claimed ${character}; no previous session to take over from`);
                this.closeOffer();
            }
            this.stopWatch = store.watch(character, value => this.onRecord(value));
        });
    }

    private onRecord(value: SessionRecord | null): void {
        const session = this.session;
        if (!session) return;
        const handoff = takeoverRoom(value, session, this.prevSession);
        if (handoff) {
            this.offer(handoff);
            return;
        }
        // Someone logged in over us: the socket may not have told us yet.
        if (value && value.session !== session && value.prevSession === session) {
            log('another device logged in as this character');
            void this.sessionEnded();
        }
    }

    /**
     * Apply a handoff, if it is still news and about the character we are now.
     *
     * The game object is what tells the two apart. Taking over a session, or
     * coming back to one left standing in the world, puts us back in the same
     * object; a login after the character left the world - quit, idled out, a
     * reboot - makes a new one somewhere else, and the room it was in no longer
     * means anything.
     */
    private offer(handoff: HandoffRoom): void {
        if (this.moved) return log(`not applying room ${handoff.roomId}: the map was placed since login`);
        if (!this.offerOpen) return log(`not applying room ${handoff.roomId}: arrived too late`);
        if (this.loginBody === null || handoff.objectNum !== this.loginBody) {
            log(`not applying room ${handoff.roomId}: game object ${handoff.objectNum} left, logged in as ${this.loginBody}`);
            this.closeOffer();
            return;
        }
        log(`applying room ${handoff.roomId}`);
        this.closeOffer();
        this.applying = true;
        try {
            this.deps.apply(handoff.roomId);
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

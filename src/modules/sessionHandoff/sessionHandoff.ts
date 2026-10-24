/**
 * Carries the room over when a character's game session moves to another device.
 *
 * Arkadia lets a login on a second device take the character over; the game drops
 * the first connection. The new device logs straight into the world, and without
 * this its map would show wherever that device last was, which in a team on the
 * move is soon a long way off.
 *
 * The device being left writes its room as it sees its session end, or parks it
 * as its tab goes into the background (see handoffRecord for the rules), and the
 * device taking over picks it up: at once if it is already there — a deliberate
 * disconnect earlier, a phone put away — or while it waits a few seconds after
 * logging in, since the takeover happens on both ends at once. A parked room is
 * checked against the game's description of the room; one that does not match
 * still goes on the map, with the map marked as lost.
 *
 * DOM- and Firebase-free: the browser wiring (src/web/sessionHandoff.ts) feeds it
 * game events and a store.
 */

import {
    claimRecord,
    inheritedProgress,
    inheritedRoom,
    takeoverProgress,
    takeoverRoom,
    TAKEOVER_WINDOW_MS,
    withHandoff,
    withParked,
    type HandoffProgress,
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
    /**
     * Write a handoff and /postepy data with a request that outlives the page,
     * for a page being closed: no transaction, which could not finish in time,
     * and no answer.
     */
    sendUnloading(character: string, handoff: HandoffRoom | null, progress: HandoffProgress | null): void;
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
    /**
     * Start noting the steps taken on the map, so a room that arrives late can
     * have them taken again from it; stop once nothing more can arrive.
     */
    startTracking(): void;
    stopTracking(): void;
    /**
     * Whether the map has been placed since tracking started - a GMCP fix, the
     * GPS, /ustaw, a plugin - rather than only stepped. Any of them knows better
     * than a handoff that arrives after it.
     */
    placedSinceLogin(): boolean;
    /**
     * Put the map in this room, then take the steps made since login again from
     * it. Not `verified`: a parked room the game's description did not confirm,
     * likely closer than whatever the map showed but to be flagged as a guess.
     */
    apply(roomId: number, verified: boolean): void;
    /** This device's /postepy data and the life it belongs to, or null with none. */
    progress?(): { objectNum: number; data: string } | null;
    /** Merge /postepy data the previous session left into this device's. */
    applyProgress?(data: string): void;
    /** The session is over: whatever else should leave this device goes now. Once per session. */
    ended?(): void;
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
    /** The current room's fingerprint from its description, null until one arrives. */
    private print: string | null = null;
    /**
     * The fingerprint of the room this connection entered the game in: the first
     * description, sealed at the end of the batch of game output it came in. A
     * parked room is checked against it, never against rooms stepped into since.
     */
    private loginPrint: string | null = null;
    private loginSealed = false;
    private stopSealTimer: (() => void) | null = null;
    /** What this session last parked, so switching tabs in one room writes once. */
    private parkedKey: string | null = null;
    private parkedProgress: string | null = null;
    /** The session {@link SessionHandoffDeps.ended} was called for. */
    private endingSession: string | null = null;
    /** The /postepy data last merged in, so a record heard twice merges once. */
    private progressTaken: string | null = null;
    /** /postepy data that came before the login said which game object we are. */
    private pendingProgress: HandoffProgress | null = null;
    /** A parked room waiting for the game to describe where this login stands. */
    private unverified: HandoffRoom | null = null;
    /** Whether {@link unverified} is already on the map as a guess. */
    private guessed = false;
    private lost = false;
    /** The game object we are, from the latest Char.Info. */
    private body: number | null = null;
    /** The game object this login put us in. */
    private loginBody: number | null = null;

    private loginSettled = false;
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
        // Whatever the last connection described is not where this one stands.
        this.print = null;
        this.loginPrint = null;
        this.loginSealed = false;
        this.stopSealTimer?.();
        this.stopSealTimer = null;
    }

    disconnected(): void {
        this.gameConnected = false;
        this.closeOffer();
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
        this.loginBody = null;
        this.parkedKey = null;
        this.parkedProgress = null;
        this.progressTaken = null;
        this.pendingProgress = null;
        this.offerOpen = true;
        // The map restores this device's own last room from storage while the
        // login's Char.Info is handled; that is not a placement. charInfoHandled()
        // starts tracking once it is done.
        this.loginSettled = false;
        this.claim();
    }

    /**
     * A Char.Info has been handled in full. For a login's, that includes the map's
     * restore of this device's own last room, and every placement or step from
     * here on is news. Later ones only keep track of which game object we are.
     */
    charInfoHandled(objectNum: number | null): void {
        this.body = objectNum;
        if (!this.loginSettled) {
            this.loginBody = objectNum;
            this.loginSettled = true;
            if (this.offerOpen) this.deps.startTracking();
            const pending = this.pendingProgress;
            this.pendingProgress = null;
            if (pending) this.takeProgress(pending);
        }
    }

    roomChanged(roomId: number): void {
        this.room = roomId;
    }

    lostChanged(lost: boolean): void {
        this.lost = lost;
    }

    /**
     * The game described the room we are in, or added to the description: the
     * exits can come in more than one message, all in the same batch of output.
     * A parked room is checked against the first description of a connection.
     */
    roomDescribed(print: string | null): void {
        this.print = print;
        if (this.loginSealed) return;
        this.loginPrint = print;
        this.stopSealTimer ??= this.deps.setTimer(() => {
            this.stopSealTimer = null;
            this.loginSealed = true;
            if (this.unverified) this.offer(this.unverified);
        }, 0);
        if (this.unverified) this.offer(this.unverified);
    }

    /**
     * The tab is going into the background, where it may be frozen before it sees
     * its session end. Leave the room behind for whoever takes over.
     */
    async park(): Promise<void> {
        const store = this.store;
        const session = this.session;
        const character = this.character;
        const roomId = this.room;
        const objectNum = this.body;
        const print = this.print;
        if (!store || !session || !character || !this.gameConnected) return;
        if (this.endedSession === session) return;
        if (!this.deps.isTrusted()) return;
        const key = roomId === null || objectNum === null || print === null || this.lost
            ? null
            : `${roomId}|${objectNum}|${print}`;
        const handoff: HandoffRoom | null = key !== null && this.parkedKey !== key
            ? {from: session, device: this.deps.deviceId, roomId: roomId!, objectNum, at: store.now(), parked: true, print: print!}
            : null;
        let progress = this.progressOf(store, session);
        const progressKey = progress?.data ?? null;
        if (progressKey === this.parkedProgress) progress = null;
        if (!handoff && !progress) return;
        if (handoff) this.parkedKey = key;
        if (progress) this.parkedProgress = progressKey;
        const written = await this.run(store, () => store.transact(character, current => withParked(current, handoff, progress)));
        if (handoff) {
            if (written?.handoff?.from === session && written.handoff.parked) log(`parked room ${roomId}`);
            else if (this.parkedKey === key) this.parkedKey = null;
        }
        if (progress && written?.progress?.from !== session && this.parkedProgress === progressKey) {
            this.parkedProgress = null;
        }
    }

    /**
     * This device saw its session end. Hand the room over if it can vouch for it.
     *
     * Safe to call more than once for the same session; the first call wins.
     * `unloading`: the page is going away, and only a request sent at once
     * will make it; a session taken over earlier has already handed over.
     */
    async sessionEnded(unloading = false): Promise<void> {
        const store = this.store;
        const session = this.session;
        const character = this.character;
        const roomId = this.room;
        const objectNum = this.body;
        if (!session || !character || this.endedSession === session) return;
        if (this.endingSession !== session) {
            this.endingSession = session;
            this.deps.ended?.();
        }
        if (!store) return log('session ended, not handing over: not signed in to Firebase');
        const why = roomId === null ? 'no room known'
            : objectNum === null ? 'game object unknown'
                : this.lost ? 'map position lost'
                    : !this.deps.isTrusted() ? 'tab was in the background'
                        : null;
        const handoff: HandoffRoom | null = why === null
            ? {from: session, device: this.deps.deviceId, roomId: roomId!, objectNum, at: store.now()}
            : null;
        // What /postepy recorded holds however long the tab slept: it only misses the rest.
        const progress = this.progressOf(store, session);
        if (why !== null) log(`session ended, not handing over the room: ${why}`);
        if (!handoff && !progress) return;
        this.endedSession = session;
        if (unloading) store.sendUnloading(character, handoff, progress);
        const written = await this.run(store, () => store.transact(character, current => withHandoff(current, handoff, store.now(), progress)));
        if (handoff && written?.handoff?.from === session) log(`handed over room ${roomId} (object ${objectNum})`);
        if (progress && written?.progress?.from === session) log(`handed over postepy (object ${progress.objectNum})`);
        if (!written) log('session ended, handoff refused: another login claimed the character too long ago');
    }

    private progressOf(store: HandoffStore, session: string): HandoffProgress | null {
        const progress = this.deps.progress?.();
        if (!progress) return null;
        return {from: session, device: this.deps.deviceId, objectNum: progress.objectNum, at: store.now(), data: progress.data};
    }

    /**
     * Merge the /postepy data the previous session left, if it is about the game
     * object we are now (see {@link offer}). Sync brings the same data; the merge
     * takes both in any order. Not tied to the room's offer: it is never wrong.
     */
    private takeProgress(progress: HandoffProgress): void {
        if (!this.deps.applyProgress) return;
        const key = `${progress.from}|${progress.at}`;
        if (this.progressTaken === key) return;
        if (!this.loginSettled) {
            this.pendingProgress = progress;
            return;
        }
        this.progressTaken = key;
        if (progress.device === this.deps.deviceId) return log('not merging postepy: left by this device');
        if (this.loginBody === null || progress.objectNum !== this.loginBody) {
            return log(`not merging postepy: game object ${progress.objectNum} left, logged in as ${this.loginBody}`);
        }
        log(`merging postepy left by the previous session`);
        this.deps.applyProgress(progress.data);
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
            const progress = inheritedProgress(previous, store.now());
            if (progress) this.takeProgress(progress);
            const inherited = inheritedRoom(previous, store.now());
            if (inherited) {
                log(`claimed ${character}; found room ${inherited.roomId} ${inherited.parked ? 'parked' : 'left'} by the previous session`);
                this.offer(inherited);
            }
            // A parked room is still waiting for a matching description, and the session that
            // parked it may yet wake up and hand over the room it really ended in.
            if (this.offerOpen && this.prevSession) {
                log(`claimed ${character}; waiting ${TAKEOVER_WINDOW_MS / 1000} s for the previous session to hand over`);
                this.stopOfferTimer = this.deps.setTimer(() => {
                    this.stopOfferTimer = null;
                    this.guess('the game never described where we are');
                    this.closeOffer();
                }, TAKEOVER_WINDOW_MS);
                this.refreshOnline();
            } else if (!inherited) {
                log(`claimed ${character}; no previous session to take over from`);
                this.closeOffer();
            }
            this.stopWatch = store.watch(character, value => this.onRecord(value));
        });
    }

    private onRecord(value: SessionRecord | null): void {
        const session = this.session;
        if (!session) return;
        const progress = takeoverProgress(value, session, this.prevSession);
        if (progress) this.takeProgress(progress);
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
        if (!this.offerOpen) return log(`not applying room ${handoff.roomId}: arrived too late`);
        // A reload or reconnect here. The map has restored the room it saves on
        // every step, which is never older than what this device wrote - and the
        // write as a page unloads rarely lands, leaving a room parked long before.
        if (handoff.device === this.deps.deviceId) {
            log(`not applying room ${handoff.roomId}: left by this device, whose map knows its own last room`);
            this.closeOffer();
            return;
        }
        if (this.deps.placedSinceLogin()) {
            log(`not applying room ${handoff.roomId}: the map was placed since login`);
            this.closeOffer();
            return;
        }
        if (this.loginBody === null || handoff.objectNum !== this.loginBody) {
            log(`not applying room ${handoff.roomId}: game object ${handoff.objectNum} left, logged in as ${this.loginBody}`);
            this.closeOffer();
            return;
        }
        if (handoff.parked && (!handoff.print || this.loginPrint !== handoff.print)) {
            // The rest of the description may still be in this batch. Without a
            // match the parked room still goes on the map - likely closer than the
            // room this device last saw - but flagged as a guess, and the offer
            // stays open for the room the session really ended in.
            this.unverified = handoff;
            if (this.guessed) return;
            if (this.loginPrint === null) return log(`parked room ${handoff.roomId} waits for the game to describe where we are`);
            if (this.loginSealed) this.guess('the room described does not match');
            return;
        }
        log(`applying room ${handoff.roomId}`);
        this.deps.apply(handoff.roomId, true);
        this.closeOffer();
    }

    /** Put the parked room on the map unconfirmed, unless something placed it since. */
    private guess(why: string): void {
        const parked = this.unverified;
        if (!parked || this.guessed || !this.offerOpen || this.deps.placedSinceLogin()) return;
        log(`applying parked room ${parked.roomId} unconfirmed: ${why}`);
        this.guessed = true;
        this.deps.apply(parked.roomId, false);
    }

    private closeOffer(): void {
        if (this.offerOpen) this.deps.stopTracking();
        this.offerOpen = false;
        this.unverified = null;
        this.guessed = false;
        this.stopOfferTimer?.();
        this.stopOfferTimer = null;
        this.refreshOnline();
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
     * Online only while a write is in flight or a login waits for a handoff: the
     * database counts every open connection, and the free plan allows a hundred.
     * Holding one for a whole game session would cap how many can play at once.
     */
    private refreshOnline(): void {
        this.store?.setOnline(this.pending > 0 || this.stopOfferTimer !== null);
    }
}

/**
 * The shape and rules of a session handoff: telling the device that takes over a
 * character which room the previous device left it in.
 *
 * One record per character, in the Realtime Database under
 * `sessionHandoff/{uid}/{character}`:
 *
 *   session      the game session that holds the character now (one per login)
 *   prevSession  the one it took the character from
 *   claimedAt    when it did, in server time
 *   handoff      the room a session was in when it saw itself end
 *
 * The handoff is written only by a device that sees its session end — the game
 * dropping it for a login elsewhere, or the player disconnecting — and only while
 * it is awake enough to trust its own map. It is never written ahead of time: a
 * room kept up to date "just in case" would be stale exactly when it matters, from
 * a phone frozen in a pocket while its character followed the team. No handoff
 * means no guess, and the new device keeps whatever it knew.
 *
 * Every login claims the record, which drops any handoff left in it. That is what
 * keeps an old one from outliving the session that came after it.
 */

export interface HandoffRoom {
    /** The session that wrote it. */
    from: string;
    device: string;
    roomId: number;
    /** Server time. */
    at: number;
}

export interface SessionRecord {
    session: string;
    device: string;
    claimedAt: number;
    prevSession: string | null;
    handoff: HandoffRoom | null;
}

/**
 * How long after a claim the session it displaced may still write its handoff.
 *
 * The takeover is seen on both ends at about the same moment, so this is a margin
 * for a slow network, not for a slow device: a tab that wakes up later than this
 * was not watching its map while the character was elsewhere.
 */
export const TAKEOVER_WINDOW_MS = 20_000;

/** How long a handoff stays good: the game drops an idle character after 30 minutes. */
export const HANDOFF_TTL_MS = 30 * 60 * 1000;

/** The record a new login writes. */
export function claimRecord(
    current: SessionRecord | null,
    me: { session: string; device: string },
    now: number,
): SessionRecord {
    return {
        session: me.session,
        device: me.device,
        claimedAt: now,
        prevSession: current?.session ?? null,
        handoff: null,
    };
}

/**
 * The room a new login inherits from the record it replaced: a handoff the
 * previous session wrote as it ended, recently enough.
 *
 * A handoff written by some older session is not enough. It landed during the
 * previous session's takeover window, and the previous session may have walked
 * anywhere since.
 */
export function inheritedRoom(previous: SessionRecord | null, now: number): number | null {
    const handoff = previous?.handoff;
    if (!previous || !handoff) return null;
    if (handoff.from !== previous.session) return null;
    if (now - handoff.at > HANDOFF_TTL_MS) return null;
    return handoff.roomId;
}

/**
 * The record with a session's handoff added, or `undefined` when it may not write.
 *
 * A session writes into its own record, or into the one that took the character
 * from it while that one is fresh and has not heard from it yet.
 *
 * `null` in, `null` out: the Realtime Database runs a transaction on its cached
 * value first, which is `null` when nothing is cached. Aborting on that would
 * never ask the server; returning `null` sends the attempt, and the server hands
 * back the real value to run on if it differs.
 */
export function withHandoff(
    current: SessionRecord | null,
    handoff: HandoffRoom,
    now: number,
): SessionRecord | null | undefined {
    if (!current) return null;
    if (current.session === handoff.from) return {...current, handoff};
    if (
        current.prevSession === handoff.from
        && !current.handoff
        && now - current.claimedAt <= TAKEOVER_WINDOW_MS
    ) {
        return {...current, handoff};
    }
    return undefined;
}

/** The room the session a login displaced handed over after the claim, if it has. */
export function takeoverRoom(
    value: SessionRecord | null,
    mySession: string,
    prevSession: string | null,
): number | null {
    if (!value || !prevSession || value.session !== mySession) return null;
    const handoff = value.handoff;
    return handoff && handoff.from === prevSession ? handoff.roomId : null;
}

/** A record as read back from the database, which drops null fields. */
export function normalizeRecord(raw: unknown): SessionRecord | null {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    if (typeof value.session !== 'string') return null;
    const handoff = value.handoff as Record<string, unknown> | null | undefined;
    return {
        session: value.session,
        device: typeof value.device === 'string' ? value.device : '',
        claimedAt: typeof value.claimedAt === 'number' ? value.claimedAt : 0,
        prevSession: typeof value.prevSession === 'string' ? value.prevSession : null,
        handoff: handoff
            && typeof handoff.from === 'string'
            && typeof handoff.roomId === 'number'
            && typeof handoff.at === 'number'
            ? {
                from: handoff.from,
                device: typeof handoff.device === 'string' ? handoff.device : '',
                roomId: handoff.roomId,
                at: handoff.at,
            }
            : null,
    };
}

/** A database key for a character name; keys may not contain `.#$[]/`. */
export function characterKey(name: string): string {
    return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

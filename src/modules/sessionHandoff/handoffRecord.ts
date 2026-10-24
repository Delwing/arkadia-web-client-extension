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
 *   handoff      the room a session was in when it saw itself end, and the game
 *                object the character was; applied only to a login that finds
 *                itself in that same object (a takeover, or a return to a
 *                character still standing in the world)
 *
 * The handoff is written by a device that sees its session end — the game
 * dropping it for a login elsewhere, or the player disconnecting — while it is
 * awake enough to trust its own map.
 *
 * A device also *parks* its room as its tab goes into the background, once per
 * room rather than on every step. That covers the phone put away in a pocket,
 * which is frozen by the time another device takes over and never sees its
 * session end. A parked room may have gone stale meanwhile - the character can
 * follow its team while the phone sleeps - so it carries a fingerprint of the room
 * as the game described it. The device taking over checks it against the room the
 * game describes there: a match is taken as fact, anything else goes on the map as
 * a guess, with the map marked as lost. No handoff means the device keeps what it knew.
 *
 * The ending (or parking) session also leaves its /postepy session in `progress`,
 * for the login that takes over to merge in. Sync carries it as well, but only
 * as often as the device being left uploads; this is the fallback for when that
 * upload comes late or never - a phone frozen in a pocket, a closed tab. It is
 * taken under the same game-object rule as the room.
 *
 * Every login claims the record, which drops any handoff left in it. That is what
 * keeps an old one from outliving the session that came after it.
 */

export interface HandoffRoom {
    /** The session that wrote it. */
    from: string;
    device: string;
    roomId: number;
    /** The game object the character was; a new login elsewhere gets a new one. */
    objectNum: number | null;
    /** Server time. */
    at: number;
    /** Written as the tab went into the background, not as the session ended. */
    parked?: boolean;
    /** The room as the game described it; see {@link descriptionPrint}. */
    print?: string;
}

/** A session's /postepy data (character key `improve_counter`), as it ended or parked. */
export interface HandoffProgress {
    /** The session that wrote it. */
    from: string;
    device: string;
    /** The life (game object) the data belongs to. */
    objectNum: number;
    /** Server time. */
    at: number;
    /** JSON: the database would drop its empty lists and null fields. */
    data: string;
}

export interface SessionRecord {
    session: string;
    device: string;
    claimedAt: number;
    prevSession: string | null;
    handoff: HandoffRoom | null;
    progress?: HandoffProgress;
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
export function inheritedRoom(previous: SessionRecord | null, now: number): HandoffRoom | null {
    const handoff = previous?.handoff;
    if (!previous || !handoff) return null;
    if (handoff.from !== previous.session) return null;
    if (now - handoff.at > HANDOFF_TTL_MS) return null;
    return handoff;
}

/** The /postepy data a new login inherits from the record it replaced; see {@link inheritedRoom}. */
export function inheritedProgress(previous: SessionRecord | null, now: number): HandoffProgress | null {
    const progress = previous?.progress;
    if (!previous || !progress) return null;
    if (progress.from !== previous.session) return null;
    if (now - progress.at > HANDOFF_TTL_MS) return null;
    return progress;
}

/**
 * The record with a session's handoff and /postepy data added, or `undefined`
 * when it may write neither.
 *
 * A session writes into its own record, or into the one that took the character
 * from it while that one is fresh and has not heard from it yet. Its /postepy
 * data may replace what it wrote there itself before.
 *
 * `null` in, `null` out: the Realtime Database runs a transaction on its cached
 * value first, which is `null` when nothing is cached. Aborting on that would
 * never ask the server; returning `null` sends the attempt, and the server hands
 * back the real value to run on if it differs.
 */
export function withHandoff(
    current: SessionRecord | null,
    handoff: HandoffRoom | null,
    now: number,
    progress: HandoffProgress | null = null,
): SessionRecord | null | undefined {
    if (!current) return null;
    const from = handoff?.from ?? progress?.from;
    if (!from) return undefined;
    const own = current.session === from;
    const displaced = current.prevSession === from && now - current.claimedAt <= TAKEOVER_WINDOW_MS;
    if (!own && !displaced) return undefined;
    let next: SessionRecord | undefined;
    if (handoff && (own || !current.handoff)) next = {...current, handoff};
    if (progress && (own || !current.progress || current.progress.from === from)) {
        next = {...(next ?? current), progress};
    }
    return next;
}

/**
 * The record with a session's parked room and /postepy data in it, or `undefined`
 * when it may write neither. Only ever into the session's own record: once another
 * login has claimed the character, the session it displaced is over and has
 * nothing to park.
 */
export function withParked(
    current: SessionRecord | null,
    handoff: HandoffRoom | null,
    progress: HandoffProgress | null = null,
): SessionRecord | null | undefined {
    if (!current) return null;
    const from = handoff?.from ?? progress?.from;
    if (!from || current.session !== from) return undefined;
    let next: SessionRecord | undefined;
    // The room a session handed over as it ended is better than one it parked.
    if (handoff && !(current.handoff?.from === from && !current.handoff.parked)) next = {...current, handoff};
    if (progress) next = {...(next ?? current), progress};
    return next;
}

/**
 * A room as the game last described it: the `room.exits` messages after a
 * description, without the wrapping, which follows each device's own screen width.
 *
 * A takeover is not announced with a GMCP `room.info`; what follows it is the
 * description of the room the character stands in, so that is what both ends
 * compare. Only the exits, though: entering the game always brings the long
 * description, even to a character in brief mode whose last room got the short
 * one, and the long one changes with the time of day besides.
 * `null` without exits, since an empty print would match any other.
 */
export function descriptionPrint(exits: readonly string[]): string | null {
    const exitText = exits.map(text => text.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    return exitText || null;
}

/** The room the session a login displaced handed over after the claim, if it has. */
export function takeoverRoom(
    value: SessionRecord | null,
    mySession: string,
    prevSession: string | null,
): HandoffRoom | null {
    if (!value || !prevSession || value.session !== mySession) return null;
    const handoff = value.handoff;
    return handoff && handoff.from === prevSession ? handoff : null;
}

/** The /postepy data the session a login displaced handed over after the claim, if it has. */
export function takeoverProgress(
    value: SessionRecord | null,
    mySession: string,
    prevSession: string | null,
): HandoffProgress | null {
    if (!value || !prevSession || value.session !== mySession) return null;
    const progress = value.progress;
    return progress && progress.from === prevSession ? progress : null;
}

function normalizeProgress(raw: unknown): HandoffProgress | null {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    if (
        typeof value.from !== 'string'
        || typeof value.objectNum !== 'number'
        || typeof value.at !== 'number'
        || typeof value.data !== 'string'
    ) return null;
    return {
        from: value.from,
        device: typeof value.device === 'string' ? value.device : '',
        objectNum: value.objectNum,
        at: value.at,
        data: value.data,
    };
}

/** A record as read back from the database, which drops null fields. */
export function normalizeRecord(raw: unknown): SessionRecord | null {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    if (typeof value.session !== 'string') return null;
    const handoff = value.handoff as Record<string, unknown> | null | undefined;
    const progress = normalizeProgress(value.progress);
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
                objectNum: typeof handoff.objectNum === 'number' ? handoff.objectNum : null,
                at: handoff.at,
                ...(handoff.parked === true ? {parked: true} : {}),
                ...(typeof handoff.print === 'string' ? {print: handoff.print} : {}),
            }
            : null,
        ...(progress ? {progress} : {}),
    };
}

/** A database key for a character name; keys may not contain `.#$[]/`. */
export function characterKey(name: string): string {
    return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

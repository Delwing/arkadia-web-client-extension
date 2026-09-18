import Client from "../Client";
import eventBus from "@modules/core/eventBus";
import {
    COVER_PREFILTER,
    PLAYER,
    matchCoverLine,
    resolveObjectId,
    type CoverLineMatch,
    type CoverSource,
    type LocationObject,
} from "@client/coverPatterns";

/**
 * Who is covered, by whom, and against whom.
 *
 * Cover is not broadcast over GMCP - there is no `covered_by` field anywhere in
 * the protocol. It is edge-triggered: a mob covering somebody nobody attacks is
 * invisible. So this is inference with decay, not a mirror of server state.
 */

const TRIGGER_TAG = "cover-tracker";

/**
 * The trigger engine wants a RegExpMatchArray back from a match function; the
 * actual parse happens in the callback, so this is just a "yes" token.
 */
const EMPTY_MATCH = (() => {
    const m = [] as unknown as RegExpMatchArray;
    m.index = 0;
    return m;
})();

/**
 * How long an edge survives without corroboration. Deliberately NOT the 5 s
 * maneuver cooldown from `coverTimer.ts` - that is the recast window, not the
 * duration. Tune this from what the debug popup shows, not from a guess.
 */
export const COVER_TTL_MS = 12000;

/**
 * Hard ceiling on an edge's total age, however well corroborated.
 *
 * A cover has no duration of its own: it lasts until it is broken, released, or one
 * of the parties dies, and all three of those clear the edge outright. So this is a
 * leak-stopper, not a timeout - it exists only for the case where a cover ends with
 * no line we can read while the blocked attacker keeps swinging at the coverer,
 * which would otherwise sustain the GMCP fingerprint forever. Set long enough that
 * it never fires during a real fight; if it does fire, that is the bug, not the
 * cover being old.
 */
export const COVER_MAX_AGE_MS = 600000;

/** How often the TTL sweep runs while the client is live. */
const SWEEP_INTERVAL_MS = 1000;

/**
 * A GMCP `attack_num` flip looks identical whether the old target was covered or
 * simply died. Deaths are announced by text a beat before the packet, so a death
 * this recent vetoes the cover reading.
 */
const DEATH_GRACE_MS = 2000;

/**
 * Same trick in the other direction: right after a break, every attacker's
 * `attack_num` flips back onto the freed target. That flip is the break, not a
 * new cover.
 */
const FREED_GRACE_MS = 2000;

export interface CoverEdge {
    /** Who is protected. */
    coveredId: number;
    /** Who is doing the protecting. */
    covererId: number;
    /** Who is blocked by it - cover is ALWAYS per-attacker. */
    attackerId: number;
    since: number;
    /** Refreshed by every corroborating line. */
    lastSeen: number;
    /** Text => confirmed, gmcp-only => suspected. */
    confidence: 'confirmed' | 'suspected';
    source: CoverSource;
}

/**
 * Why an edge went away. Four different things used to log an indistinguishable
 * "expired", which made the popup useless for the one question it exists to
 * answer: was that the TTL, or did somebody vanish?
 */
export type CoverExpiryReason = 'ttl' | 'gone' | 'death' | 'stun' | 'max-age';

export interface CoverLogEntry {
    at: number;
    kind: 'established' | 'failed' | 'blocked' | 'break-failed' | 'break-ok'
        | 'released' | 'retreat' | 'expired' | 'gmcp-suspect' | 'ambiguous';
    coveredId?: number;
    coveredName?: string;
    covererId?: number;
    covererName?: string;
    attackerId?: number;
    attackerName?: string;
    source: CoverSource;
    /** 'blocked' only - did we already hold this edge? The tracker's own grade. */
    wasKnown?: boolean;
    /** 'expired' only - which of the removal paths fired. */
    reason?: CoverExpiryReason;
    /** 'expired' with reason 'gone' - who dropped out of the room. */
    missingIds?: number[];
    /** The game line verbatim, '' for gmcp / expiry. */
    raw: string;
}

export interface CoverStateObject {
    num: number;
    desc: string;
    category: 'player' | 'team' | 'rest' | 'rest-noncombat';
}

/**
 * Full snapshot, emitted on every change. Carries the roster alongside the edges
 * so the popup can render "who is reachable" without reaching into the client.
 */
export interface CoverStateSnapshot {
    at: number;
    edges: CoverEdge[];
    objects: CoverStateObject[];
    playerNum?: number;
}

export interface CoverTrackerContext {
    now(): number;
    getObjects(): LocationObject[];
    getPlayerNum(): number | undefined;
    emitState(snapshot: CoverStateSnapshot): void;
    emitEvent(entry: CoverLogEntry): void;
}

export interface CoverTracker {
    /** Feeds one game line through the state machine. True when it was recognised. */
    handleLine(line: string): boolean;
    handleObjectsData(data: Record<string | number, { attack_num?: unknown; desc?: string }>): void;
    handleObjectsNums(nums: number[]): void;
    /** TTL sweep. Called on a timer by the client, directly by the tests. */
    tick(now?: number): void;
    getEdges(): CoverEdge[];
    /** Per-attacker reachability - never a boolean on the object (see 2.1). */
    isCoveredFor(coveredId: number, attackerId: number): boolean;
    /** Everyone `attackerId` currently cannot reach. */
    getCoveredForAttacker(attackerId: number): number[];
    /**
     * Documented hook for stun: a stunned coverer protects nobody. There is no
     * general "mob is stunned" detector in the client today, so nothing calls
     * this with `'stun'` yet beyond what can be attributed to an object id.
     */
    clearEdgesFor(covererId: number, reason: 'stun' | 'gone' | 'death'): void;
    reset(): void;
}

const edgeKey = (coveredId: number, covererId: number, attackerId: number) =>
    `${coveredId}:${covererId}:${attackerId}`;

export function createCoverTracker(ctx: CoverTrackerContext): CoverTracker {
    const edges = new Map<string, CoverEdge>();
    /** Last known `attack_num` per object, so a flip can be spotted. */
    const attackNum = new Map<number, number | undefined>();
    /** Names survive the mob leaving the room; the log has to stay readable. */
    const descCache = new Map<number, string>();
    const recentDeaths = new Map<number, number>();
    const recentlyFreed = new Map<number, number>();
    /** Two-strike debounce for an edge party dropping out of `objects.nums`. */
    const missingPartyCounts = new Map<number, number>();
    let currentNums: Set<number> | undefined;

    const objects = () => ctx.getObjects();
    const playerNum = () => ctx.getPlayerNum();

    function cacheDescs(list: LocationObject[]) {
        for (const o of list) {
            if (o.desc) descCache.set(o.num, o.desc);
        }
    }

    function nameOf(id?: number): string | undefined {
        if (id === undefined) return undefined;
        return descCache.get(id);
    }

    function snapshot(): CoverStateSnapshot {
        const list = objects();
        cacheDescs(list);
        return {
            at: ctx.now(),
            edges: [...edges.values()],
            objects: list
                .filter(o => o.desc)
                .map(o => ({
                    num: o.num,
                    desc: o.desc!,
                    category: (o.__category ?? 'rest') as CoverStateObject['category'],
                })),
            playerNum: playerNum(),
        };
    }

    let dirty = false;
    function markChanged() {
        dirty = true;
    }

    /** One state emission per input, however many edges it touched. */
    function flush() {
        if (!dirty) return;
        dirty = false;
        ctx.emitState(snapshot());
    }

    function log(entry: CoverLogEntry) {
        ctx.emitEvent(entry);
    }

    function resolve(name: string | undefined, opts: { trimLeadingWords?: boolean } = {}) {
        if (!name) return { id: undefined as number | undefined, ambiguous: false };
        const list = objects();
        cacheDescs(list);
        return resolveObjectId(name, list, { playerNum: playerNum(), ...opts });
    }

    function upsert(
        coveredId: number,
        covererId: number,
        attackerId: number,
        at: number,
        source: CoverSource,
        confidence: CoverEdge['confidence'],
    ): { edge: CoverEdge; created: boolean } {
        const key = edgeKey(coveredId, covererId, attackerId);
        const existing = edges.get(key);
        if (existing) {
            existing.lastSeen = at;
            // Text is authoritative; GMCP only fills gaps and never downgrades.
            if (confidence === 'confirmed' && existing.confidence !== 'confirmed') {
                existing.confidence = 'confirmed';
                existing.source = source;
            }
            markChanged();
            return { edge: existing, created: false };
        }
        const edge: CoverEdge = {
            coveredId, covererId, attackerId,
            since: at, lastSeen: at, confidence, source,
        };
        edges.set(key, edge);
        markChanged();
        return { edge, created: true };
    }

    function removeWhere(predicate: (e: CoverEdge) => boolean): CoverEdge[] {
        const removed: CoverEdge[] = [];
        for (const [key, edge] of edges) {
            if (predicate(edge)) {
                edges.delete(key);
                removed.push(edge);
            }
        }
        if (removed.length) markChanged();
        return removed;
    }

    function logExpiry(
        removed: CoverEdge[],
        at: number,
        reason: CoverExpiryReason,
        missingIds?: number[],
    ) {
        for (const edge of removed) {
            log({
                at,
                kind: 'expired',
                reason,
                missingIds: missingIds?.filter(id =>
                    id === edge.coveredId || id === edge.covererId || id === edge.attackerId),
                coveredId: edge.coveredId,
                coveredName: nameOf(edge.coveredId),
                covererId: edge.covererId,
                covererName: nameOf(edge.covererId),
                attackerId: edge.attackerId,
                attackerName: nameOf(edge.attackerId),
                source: edge.source,
                raw: '',
            });
        }
    }

    function entryFor(
        kind: CoverLogEntry['kind'],
        match: CoverLineMatch,
        raw: string,
        ids: { coveredId?: number; covererId?: number; attackerId?: number },
        extra: Partial<CoverLogEntry> = {},
    ): CoverLogEntry {
        return {
            at: ctx.now(),
            kind,
            coveredId: ids.coveredId,
            coveredName: nameOf(ids.coveredId) ?? displayName(match.covered),
            covererId: ids.covererId,
            covererName: nameOf(ids.covererId) ?? displayName(match.coverer),
            attackerId: ids.attackerId,
            attackerName: nameOf(ids.attackerId),
            source: match.source,
            raw,
            ...extra,
        };
    }

    function displayName(raw?: string): string | undefined {
        if (!raw) return undefined;
        return raw === PLAYER ? 'ty' : raw;
    }

    // -- text paths ---------------------------------------------------------

    function applyEstablished(match: CoverLineMatch, raw: string) {
        const at = ctx.now();
        const covered = resolve(match.covered);
        const coverer = resolve(match.coverer, { trimLeadingWords: match.covererHasOrderPrefix });
        if (covered.id === undefined || coverer.id === undefined || covered.id === coverer.id) {
            log(entryFor('ambiguous', match, raw, {
                coveredId: covered.id, covererId: coverer.id,
            }));
            return;
        }

        let created = 0;
        for (const attackerName of match.attackers ?? []) {
            const attacker = resolve(attackerName);
            if (attacker.id === undefined || attacker.id === coverer.id) continue;
            // A tie anywhere means we are guessing: say so rather than claim a fact.
            const suspected = covered.ambiguous || coverer.ambiguous || attacker.ambiguous;
            upsert(covered.id, coverer.id, attacker.id, at,
                match.source, suspected ? 'suspected' : 'confirmed');
            created++;
            log(entryFor(match.kind === 'retreat' ? 'retreat' : 'established', match, raw, {
                coveredId: covered.id, covererId: coverer.id, attackerId: attacker.id,
            }));
            if (suspected) {
                log(entryFor('ambiguous', match, raw, {
                    coveredId: covered.id, covererId: coverer.id, attackerId: attacker.id,
                }));
            }
        }
        // 2.1: a line that yields no attacker is dropped, never turned into a
        // wildcard edge - that is the boolean bug the edge model exists to avoid.
        if (created === 0) {
            log(entryFor('ambiguous', match, raw, {
                coveredId: covered.id, covererId: coverer.id,
            }));
        }
    }

    function applyBlocked(match: CoverLineMatch, raw: string) {
        const at = ctx.now();
        const covered = resolve(match.covered);
        const coverer = resolve(match.coverer);
        const attacker = resolve(match.attackers?.[0]);
        if (covered.id === undefined || coverer.id === undefined || attacker.id === undefined) {
            log(entryFor('ambiguous', match, raw, {
                coveredId: covered.id, covererId: coverer.id, attackerId: attacker.id,
            }));
            return;
        }
        const wasKnown = edges.has(edgeKey(covered.id, coverer.id, attacker.id));
        // The line carries both ids, so even an unknown pairing is full information.
        upsert(covered.id, coverer.id, attacker.id, at, match.source, 'confirmed');
        log(entryFor('blocked', match, raw, {
            coveredId: covered.id, covererId: coverer.id, attackerId: attacker.id,
        }, { wasKnown }));
    }

    function applyBreakFailed(match: CoverLineMatch, raw: string) {
        const at = ctx.now();
        const covered = resolve(match.covered);
        if (covered.id === undefined) {
            log(entryFor('ambiguous', match, raw, {}));
            return;
        }
        // Names only the covered party: refreshes what we hold, creates nothing.
        for (const edge of edges.values()) {
            if (edge.coveredId === covered.id) {
                edge.lastSeen = at;
                markChanged();
            }
        }
        log(entryFor('break-failed', match, raw, { coveredId: covered.id }));
    }

    function applyBreakOk(match: CoverLineMatch, raw: string) {
        const covered = resolve(match.covered);
        if (covered.id === undefined) {
            if (!match.playerOnly) log(entryFor('ambiguous', match, raw, {}));
            return;
        }
        const attacker = match.playerOnly ? playerNum() : undefined;
        // "Juz walczysz z X" only ever speaks for us, so with no id of our own
        // there is nothing it can safely clear.
        if (match.playerOnly && attacker === undefined) return;
        // 1.4: a successful break frees the target for the WHOLE team - every
        // edge for this covered id goes, whoever the coverer or attacker was.
        const removed = removeWhere(e =>
            e.coveredId === covered.id && (attacker === undefined || e.attackerId === attacker));
        if (removed.length === 0 && match.playerOnly) return;
        recentlyFreed.set(covered.id, ctx.now());
        log(entryFor('break-ok', match, raw, { coveredId: covered.id }));
    }

    function applyReleased(match: CoverLineMatch, raw: string) {
        const covered = resolve(match.covered);
        const coverer = resolve(match.coverer);
        if (covered.id === undefined || coverer.id === undefined) {
            log(entryFor('ambiguous', match, raw, {
                coveredId: covered.id, covererId: coverer.id,
            }));
            return;
        }
        removeWhere(e => e.coveredId === covered.id && e.covererId === coverer.id);
        recentlyFreed.set(covered.id, ctx.now());
        log(entryFor('released', match, raw, {
            coveredId: covered.id, covererId: coverer.id,
        }));
    }

    function applyDeath(match: CoverLineMatch) {
        const who = resolve(match.who);
        if (who.id === undefined) return;
        const at = ctx.now();
        recentDeaths.set(who.id, at);
        const removed = removeWhere(e =>
            e.coveredId === who.id || e.covererId === who.id || e.attackerId === who.id);
        logExpiry(removed, at, 'death');
    }

    function handleLine(line: string): boolean {
        const match = matchCoverLine(line);
        if (!match) return false;
        const raw = line.replace(/^[ >]+/, '').trim();
        switch (match.kind) {
            case 'established':
            case 'retreat':
                applyEstablished(match, raw);
                break;
            case 'blocked':
                applyBlocked(match, raw);
                break;
            case 'break-failed':
                applyBreakFailed(match, raw);
                break;
            case 'break-ok':
                applyBreakOk(match, raw);
                break;
            case 'released':
                applyReleased(match, raw);
                break;
            case 'death':
                applyDeath(match);
                break;
            case 'failed':
                log(entryFor('failed', match, raw, {}));
                break;
            case 'ambiguous':
                log(entryFor('ambiguous', match, raw, {}));
                break;
        }
        flush();
        return true;
    }

    // -- GMCP corroboration (1.3) -------------------------------------------

    function isRecent(map: Map<number, number>, id: number, window: number): boolean {
        const at = map.get(id);
        return at !== undefined && ctx.now() - at <= window;
    }

    function handleObjectsData(data: Record<string | number, { attack_num?: unknown; desc?: string }>) {
        if (!data || typeof data !== 'object') return;
        const at = ctx.now();
        const flips: { attacker: number; from: number; to: number }[] = [];

        for (const [idStr, obj] of Object.entries(data)) {
            const id = Number(idStr);
            if (!Number.isFinite(id) || !obj) continue;
            if (typeof obj.desc === 'string') descCache.set(id, obj.desc);
            if (!('attack_num' in obj)) continue;
            const next = typeof obj.attack_num === 'number' ? obj.attack_num : undefined;
            const prev = attackNum.get(id);
            attackNum.set(id, next);
            if (prev !== undefined && next !== undefined && prev !== next) {
                flips.push({ attacker: id, from: prev, to: next });
            }
        }

        for (const flip of flips) {
            if (flip.from === flip.attacker || flip.to === flip.attacker) continue;
            // The death case, and the regression that matters: on a kill the same
            // flip happens, but the old target drops out of objects.nums with it.
            if (currentNums && (!currentNums.has(flip.from) || !currentNums.has(flip.to))) continue;
            if (isRecent(recentDeaths, flip.from, DEATH_GRACE_MS)) continue;
            // A flip back onto a target we just freed is the break, not a new cover.
            if (isRecent(recentlyFreed, flip.to, FREED_GRACE_MS)) continue;

            const { created } = upsert(flip.from, flip.to, flip.attacker, at, 'gmcp', 'suspected');
            if (created) {
                log({
                    at,
                    kind: 'gmcp-suspect',
                    coveredId: flip.from,
                    coveredName: nameOf(flip.from),
                    covererId: flip.to,
                    covererName: nameOf(flip.to),
                    attackerId: flip.attacker,
                    attackerName: nameOf(flip.attacker),
                    source: 'gmcp',
                    raw: '',
                });
            }
        }
        corroborateFromGmcp();
        flush();
    }

    function handleObjectsNums(nums: number[]) {
        if (!Array.isArray(nums) || nums.length === 0) return;
        currentNums = new Set(nums);
        const present = currentNums;

        // 2.3.3: an edge needs all three parties in the room. A departed attacker
        // makes the block moot just as surely as a departed coverer.
        //
        // But `objects.nums` can arrive partial (the same reason the enemy queue
        // debounces), so one miss is not proof of absence - and since `attackerId`
        // is usually US, a single frame without our own num would otherwise wipe
        // every edge at once. Two strikes, like `missingEnemyCounts`. A death or a
        // release line still clears immediately; this only governs the quiet case
        // where somebody simply stops being listed.
        const parties = new Set<number>();
        for (const e of edges.values()) {
            parties.add(e.coveredId);
            parties.add(e.covererId);
            parties.add(e.attackerId);
        }
        for (const id of missingPartyCounts.keys()) {
            if (!parties.has(id)) missingPartyCounts.delete(id);
        }

        const gone = new Set<number>();
        for (const id of parties) {
            if (present.has(id)) {
                missingPartyCounts.delete(id);
                continue;
            }
            const misses = (missingPartyCounts.get(id) ?? 0) + 1;
            if (misses >= 2) {
                missingPartyCounts.delete(id);
                gone.add(id);
            } else {
                missingPartyCounts.set(id, misses);
            }
        }

        if (gone.size > 0) {
            const removed = removeWhere(e =>
                gone.has(e.coveredId) || gone.has(e.covererId) || gone.has(e.attackerId));
            logExpiry(removed, ctx.now(), 'gone', [...gone]);
        }

        corroborateFromGmcp();
        for (const id of attackNum.keys()) {
            if (!present.has(id)) attackNum.delete(id);
        }
        flush();
    }

    /**
     * While a cover holds, GMCP keeps re-stating it: the blocked attacker's
     * `attack_num` points at the COVERER (that is what the cover did to it) and the
     * real target is still in the room. That fingerprint is continuous evidence,
     * and without reading it the TTL was a guillotine rather than a decay - the
     * establishing line fires once, and `staje ci na drodze` only answers a fresh
     * poke at the covered target, so a cover nobody pokes starved at 12 s while it
     * was still very much up in game.
     *
     * This only sustains an edge that already exists; it never creates one. The
     * fingerprint breaks the moment the attacker retargets, which is the normal
     * exit, and `COVER_MAX_AGE_MS` bounds the pathological case where a cover is
     * dropped silently while the attacker keeps hitting the coverer.
     */
    function corroborateFromGmcp() {
        const at = ctx.now();
        for (const edge of edges.values()) {
            if (attackNum.get(edge.attackerId) !== edge.covererId) continue;
            if (currentNums && !currentNums.has(edge.coveredId)) continue;
            if (at - edge.since > COVER_MAX_AGE_MS) continue;
            edge.lastSeen = at;
            markChanged();
        }
    }

    function tick(now = Date.now()) {
        // The ceiling first, so a fingerprint-sustained edge reports the limit that
        // actually caught it rather than looking like an ordinary timeout.
        const tooOld = removeWhere(e => now - e.since > COVER_MAX_AGE_MS);
        logExpiry(tooOld, now, 'max-age');
        const stale = removeWhere(e => now - e.lastSeen > COVER_TTL_MS);
        logExpiry(stale, now, 'ttl');
        flush();
    }

    return {
        handleLine,
        handleObjectsData,
        handleObjectsNums,
        tick,
        getEdges: () => [...edges.values()],
        isCoveredFor: (coveredId, attackerId) =>
            [...edges.values()].some(e => e.coveredId === coveredId && e.attackerId === attackerId),
        getCoveredForAttacker: attackerId => [
            ...new Set([...edges.values()]
                .filter(e => e.attackerId === attackerId)
                .map(e => e.coveredId)),
        ],
        clearEdgesFor: (covererId, reason) => {
            const removed = removeWhere(e => e.covererId === covererId);
            logExpiry(removed, ctx.now(), reason === 'death' ? 'death' : 'stun');
            flush();
        },
        reset: () => {
            edges.clear();
            attackNum.clear();
            recentDeaths.clear();
            recentlyFreed.clear();
            currentNums = undefined;
            markChanged();
            flush();
        },
    };
}

/** Set by initCoverTracker so `/prze` can fall back to the cover store (7.2). */
let activeTracker: CoverTracker | undefined;

export function getCoverTracker(): CoverTracker | undefined {
    return activeTracker;
}

export default function initCoverTracker(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[],
) {
    const list = aliases ?? client.aliases;

    const tracker = createCoverTracker({
        now: () => client.now(),
        getObjects: () => client.ObjectManager?.getObjectsOnLocation() ?? [],
        getPlayerNum: () => client.TeamManager?.playerNum,
        emitState: snapshot => eventBus.emit('cover.state', snapshot),
        emitEvent: entry => eventBus.emit('cover.event', entry),
    });
    activeTracker = tracker;

    // One trigger for the whole grammar: the rule table is ordered, and several
    // rules can match the same line, so the first-match-wins scan has to stay in
    // one place. COVER_PREFILTER keeps the per-line cost to a single regex.
    client.Triggers.registerTrigger(
        line => (COVER_PREFILTER.test(line.text) ? EMPTY_MATCH : undefined),
        line => {
            tracker.handleLine(line.text);
            return line;
        },
        TRIGGER_TAG,
    );

    client.on('gmcp.objects.nums', (detail: any) => {
        const nums = Array.isArray(detail) ? detail : detail?.nums;
        if (Array.isArray(nums)) tracker.handleObjectsNums(nums);
    });
    client.on('gmcp.objects.data', (data: any) => {
        tracker.handleObjectsData(data);
    });
    // Leaving the room is already covered by objects.nums - everyone drops out of
    // it at once - so there is no separate room-change reset to get wrong.

    // Stun is deliberately not wired: `stunStart` (spells.ts) carries no payload,
    // so it cannot be attributed to an object id, and this task does not build a
    // stun detector. `clearEdgesFor(covererId, 'stun')` is the hook when one exists.

    setInterval(() => tracker.tick(Date.now()), SWEEP_INTERVAL_MS);

    list.push({
        pattern: /^\/zaslony$/,
        callback: () => eventBus.emit('cover.popup.open'),
    });

    return tracker;
}

/**
 * Viewer state and everything derived from it.
 *
 * The derivation is one pure function (`deriveView`) rather than a scatter of
 * `useMemo`s: rows, match list, per-session hit counts, channel counts and the
 * timeline all have to agree about which lines are visible, and the only way to
 * guarantee that is to compute them together from one filter pass.
 */
import { allChannelsOn, CHANNELS, type Channel, type ChannelFilter } from "./channels";
import type { LogEventKind } from "./events";
import { countMatches, makeMatcher, normalizeMatchIndex, splitMatches, type MatchSegment } from "./search";
import type { Density, LogSession, SearchScope, TimeRange } from "./types";

export interface ViewerState {
    sessionId: string;
    sessionFilter: string;
    query: string;
    caseSensitive: boolean;
    regex: boolean;
    onlyMatches: boolean;
    scope: SearchScope;
    /** Raw index; may run outside [0, total) — `deriveView` normalises it. */
    matchIndex: number;
    channels: ChannelFilter;
    /**
     * Narrows the log to a slice of the session. Set from a line's context menu
     * or by dragging the timeline handles; null means the whole session.
     * Everything that exports or copies works on what this leaves visible.
     */
    range: TimeRange | null;
    showTimestamps: boolean;
    /** The tag and line-number columns, shown or hidden together. */
    showMeta: boolean;
    showColors: boolean;
    wrap: boolean;
    follow: boolean;
    density: Density;
    /** One-off message under the counter; cleared on the next query edit. */
    notice: string;
}

/**
 * Sidebar / navigation order: newest session first, which is also the order the
 * day headings ("Dzisiaj", "Wczoraj", then dates) have to come out in.
 *
 * Computed here rather than trusted from the caller — the IndexedDB adapter
 * hands sessions over oldest-first, mock data comes newest-first, and neither
 * should decide which log the viewer opens on.
 */
export function orderSessions(sessions: LogSession[]): LogSession[] {
    return [...sessions].sort((a, b) => b.startedAt - a.startedAt);
}

/** The session to open: the one still recording, else the most recent. */
export function initialSessionId(sessions: LogSession[]): string {
    const live = sessions.find((session) => session.live);
    if (live) return live.id;
    return orderSessions(sessions)[0]?.id ?? "";
}

export function initialViewerState(sessionId: string): ViewerState {
    return {
        sessionId,
        sessionFilter: "",
        query: "",
        caseSensitive: false,
        regex: false,
        onlyMatches: false,
        scope: "log",
        matchIndex: 0,
        channels: allChannelsOn(),
        range: null,
        showTimestamps: true,
        showMeta: true,
        // On by default: the game's own colours are how players read their logs,
        // and the plain-text rendering is the fallback, not the intent.
        showColors: true,
        wrap: true,
        follow: true,
        density: "compact",
        notice: "",
    };
}

/**
 * The scope a search actually runs in.
 *
 * "Zakres" can outlive the range it was chosen for: the range is cleared from
 * the status bar, by switching sessions, or by a drag that covers the whole
 * log. Falling back to the open log is what the in-client browser does
 * (`LogBrowser.tsx:1304`), and it beats reporting nothing found in a slice that
 * no longer exists.
 */
export function effectiveScope(state: Pick<ViewerState, "scope" | "range">): SearchScope {
    return state.scope === "range" && !state.range ? "log" : state.scope;
}

/**
 * The slice the viewer is currently narrowed to, or null for the whole log.
 *
 * A range is only APPLIED in "Zakres" scope. In "Ten log" and "Wszystkie logi"
 * it stays drawn on the timeline, ready to be picked up again, but it does not
 * hide anything — otherwise those two scopes would promise a search wider than
 * the rows they can show, and the counter would start naming hits the player
 * cannot scroll to.
 */
export function appliedRange(state: Pick<ViewerState, "scope" | "range">): TimeRange | null {
    return effectiveScope(state) === "range" ? state.range : null;
}

/** The slice that outlives a session: view preferences, not what is on screen. */
export interface PersistedPreferences {
    channels: ChannelFilter;
    showTimestamps: boolean;
    /** The tag and line-number columns, shown or hidden together. */
    showMeta: boolean;
    showColors: boolean;
    wrap: boolean;
    scope: SearchScope;
    density: Density;
    sessionId?: string;
}

export function pickPreferences(state: ViewerState): PersistedPreferences {
    return {
        channels: state.channels,
        showTimestamps: state.showTimestamps,
        showMeta: state.showMeta,
        showColors: state.showColors,
        wrap: state.wrap,
        // "Zakres" is not storable: the range it depends on is deliberately not
        // persisted either, so the scope to come back to is the wider one.
        scope: state.scope === "range" ? "log" : state.scope,
        density: state.density,
        sessionId: state.sessionId,
    };
}

/** Merges stored preferences, ignoring anything that no longer type-checks. */
export function applyPreferences(state: ViewerState, stored: unknown): ViewerState {
    if (!stored || typeof stored !== "object") return state;
    const preferences = stored as Partial<PersistedPreferences>;
    const channels = { ...state.channels };
    if (preferences.channels && typeof preferences.channels === "object") {
        for (const channel of CHANNELS) {
            const value = (preferences.channels as Partial<ChannelFilter>)[channel];
            if (typeof value === "boolean") channels[channel] = value;
        }
    }
    return {
        ...state,
        channels,
        showTimestamps:
            typeof preferences.showTimestamps === "boolean" ? preferences.showTimestamps : state.showTimestamps,
        showMeta: typeof preferences.showMeta === "boolean" ? preferences.showMeta : state.showMeta,
        showColors: typeof preferences.showColors === "boolean" ? preferences.showColors : state.showColors,
        wrap: typeof preferences.wrap === "boolean" ? preferences.wrap : state.wrap,
        scope: preferences.scope === "all" || preferences.scope === "log" ? preferences.scope : state.scope,
        density:
            preferences.density === "compact" || preferences.density === "comfortable"
                ? preferences.density
                : state.density,
    };
}

export interface RenderedRow {
    /** Index into the session's full line list — used for scroll targets. */
    lineIndex: number;
    number: number;
    timestamp: number;
    channel: Channel;
    text: string;
    html?: string;
    event?: LogEventKind;
    segments: MatchSegment[];
    matchCount: number;
}

/**
 * The character playing on the first and last matching line of a session — the
 * two lines a hand-over from another log can land on. Either is undefined when
 * the session's character is not known there.
 */
export interface MatchEdges {
    first?: string;
    last?: string;
}

export interface MatchRef {
    /** Index into `rows`. */
    row: number;
    /** Which highlighted segment within that row. */
    occurrence: number;
}

export interface DerivedView {
    session: LogSession;
    /** Sessions surviving the sidebar filter, in display order. */
    visibleSessions: LogSession[];
    rows: RenderedRow[];
    matches: MatchRef[];
    totalMatches: number;
    /** `matchIndex` normalised into range; 0 when there are no matches. */
    currentMatch: number;
    currentRow: number | null;
    hitsBySession: Record<string, number>;
    /** Who was playing at either end of another session's hits — see `stepMatch`. */
    matchEdges: Record<string, MatchEdges>;
    channelCounts: Record<Channel, number>;
    invalidPattern: boolean;
    searching: boolean;
    /** The slice actually in force — see `appliedRange`. */
    range: TimeRange | null;
}

function matchesSessionFilter(session: LogSession, filter: string): boolean {
    if (!filter) return true;
    const haystack =
        `${session.characters.join(" ")} ${session.dayLabel} ${session.dateLabel} ${session.file}`.toLowerCase();
    return haystack.includes(filter);
}

export function deriveView(sessions: LogSession[], state: ViewerState): DerivedView {
    const matcher = makeMatcher(state.query, { regex: state.regex, caseSensitive: state.caseSensitive });
    const range = appliedRange(state);
    const filter = state.sessionFilter.trim().toLowerCase();
    const ordered = orderSessions(sessions);
    const visibleSessions = ordered.filter((session) => matchesSessionFilter(session, filter));
    const session = ordered.find((candidate) => candidate.id === state.sessionId) ?? ordered[0];

    // Deliberately NOT range-filtered: the range belongs to the session being
    // viewed, so applying it to another session's badge would be meaningless.
    const hitsBySession: Record<string, number> = {};
    const matchEdges: Record<string, MatchEdges> = {};
    for (const candidate of ordered) {
        let total = 0;
        const edges: MatchEdges = {};
        if (matcher.regex) {
            for (const line of candidate.lines) {
                if (!state.channels[line.channel]) continue;
                const count = countMatches(line.text, matcher.regex);
                if (count === 0) continue;
                if (total === 0) edges.first = line.character;
                edges.last = line.character;
                total += count;
            }
        }
        hitsBySession[candidate.id] = total;
        matchEdges[candidate.id] = edges;
    }

    const channelCounts = Object.fromEntries(CHANNELS.map((channel) => [channel, 0])) as Record<Channel, number>;
    const rows: RenderedRow[] = [];
    const matches: MatchRef[] = [];

    if (session) {
        session.lines.forEach((line, lineIndex) => {
            channelCounts[line.channel] += 1;
            if (!state.channels[line.channel]) return;
            // The range narrows the log BEFORE anything else looks at it, so
            // exporting, copying and the match counter all agree with what is
            // on screen. `appliedRange` above is what decides whether there is
            // one to apply: outside "Zakres" scope a selected slice is drawn
            // but not in force.
            if (range && (line.timestamp < range.from || line.timestamp > range.to)) return;

            let segments: MatchSegment[] = [{ text: line.text, match: false }];
            let matchCount = 0;
            if (matcher.regex) {
                const split = splitMatches(line.text, matcher.regex);
                segments = split.segments;
                matchCount = split.count;
            }
            if (state.onlyMatches && matcher.regex && matchCount === 0) return;

            const rowIndex = rows.length;
            for (let occurrence = 0; occurrence < matchCount; occurrence += 1) {
                matches.push({ row: rowIndex, occurrence });
            }
            rows.push({
                lineIndex,
                number: line.number,
                timestamp: line.timestamp,
                channel: line.channel,
                text: line.text,
                html: line.html,
                event: line.event,
                segments,
                matchCount,
            });
        });
    }

    const totalMatches = matches.length;
    const currentMatch = normalizeMatchIndex(state.matchIndex, totalMatches);
    return {
        session,
        visibleSessions,
        rows,
        matches,
        totalMatches,
        currentMatch,
        currentRow: totalMatches ? matches[currentMatch].row : null,
        hitsBySession,
        matchEdges,
        channelCounts,
        invalidPattern: matcher.invalid,
        searching: Boolean(matcher.regex),
        range,
    };
}

/**
 * Where "next match" goes.
 *
 * In All-logs scope, stepping off either end of the current log hands over to
 * the next session that has matches, in sidebar order, wrapping round. Within a
 * log it wraps locally. Both cases announce themselves — a jump the player did
 * not ask for and cannot see the reason for is the thing the spec is most
 * insistent about avoiding.
 */
export interface StepResult {
    matchIndex: number;
    sessionId?: string;
    notice: string;
}

export function stepMatch(
    direction: 1 | -1,
    state: ViewerState,
    view: DerivedView,
    sessionOrder: LogSession[],
): StepResult | null {
    const { totalMatches, currentMatch, hitsBySession, matchEdges } = view;

    if (state.scope === "all") {
        const atEdge =
            totalMatches === 0 || (direction > 0 ? currentMatch === totalMatches - 1 : currentMatch === 0);
        if (atEdge && sessionOrder.length > 1) {
            const order = sessionOrder.map((session) => session.id);
            const from = order.indexOf(state.sessionId);
            for (let step = 1; step <= order.length; step += 1) {
                const index = (((from + direction * step) % order.length) + order.length) % order.length;
                const candidateId = order[index];
                if (candidateId === state.sessionId) break;
                if ((hitsBySession[candidateId] ?? 0) === 0) continue;
                const candidate = sessionOrder[index];
                // One name, not the session's whole list: the sub-line does not
                // wrap, and the useful name is the one playing where the jump
                // lands — which is the first hit going forward, the last going
                // back.
                const edges = matchEdges[candidateId] ?? {};
                const who = direction > 0 ? edges.first : edges.last;
                return {
                    sessionId: candidateId,
                    // -1 lands on the last match of the session we move back into.
                    matchIndex: direction > 0 ? 0 : -1,
                    notice: `${direction > 0 ? "Dalej w" : "Powrot do"}: ${who ? `${who}, ` : ""}${candidate.dayLabel}`,
                };
            }
        }
    }

    if (totalMatches === 0) return null;

    let notice = "";
    if (direction > 0 && currentMatch === totalMatches - 1) notice = "Przewinieto do pierwszego trafienia";
    if (direction < 0 && currentMatch === 0) notice = "Przewinieto do ostatniego trafienia";
    return { matchIndex: currentMatch + direction, notice };
}

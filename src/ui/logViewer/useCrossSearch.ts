/**
 * Search across every log, for a list that does not hold its lines.
 *
 * A player's whole history does not fit in memory as parsed lines, so the
 * All-logs badges cannot be counted in the render the way the open session's
 * are. Instead each session is read through the host, reduced to a tally
 * (`model/crossHits.ts`) and let go, one after another — from its stored
 * search text (`model/searchText.ts`) when the host keeps one, which skips
 * parsing the log, else from its lines.
 *
 * Tallies are remembered for the last few searches, outside any one viewer, so
 * going back to a search (a deleted letter, the window opened again) answers at
 * once. A plain query that extends an earlier one only reads the logs where
 * that one found something: no other log can hold the longer text.
 */
import { useEffect, useMemo, useState } from "react";
import type { ChannelFilter } from "./model/channels";
import { tallySession, totalCrossHits, type SessionTally } from "./model/crossHits";
import { makeMatcher, searchKey } from "./model/search";
import { tallySearchText, type SearchText } from "./model/searchText";
import { hasLines, type LogSession, type LogSessionInfo } from "./model/types";
import { orderSessions, type CrossHits } from "./model/viewerState";

export interface CrossSearch extends CrossHits {
    /** Sessions searched so far, and how many there are to search. */
    scanned: number;
    total: number;
    running: boolean;
}

/** Waits this long after the query settles before reading every log. */
const START_DELAY_MS = 250;
/** How often the badges catch up with the scan. */
const PUBLISH_EVERY_MS = 250;
/** Searches whose tallies are remembered. */
const REMEMBERED_SEARCHES = 16;

interface Scan {
    /** The search this scan is for; a scan for another one is not an answer. */
    key: string;
    tallies: Map<string, SessionTally>;
    scanned: number;
    total: number;
    running: boolean;
}

/** A tally, with the list entry it was counted for: a log that grew since is counted again. */
interface Remembered {
    stamp: string;
    tally: SessionTally;
}

interface RememberedSearch {
    query: string;
    regex: boolean;
    caseSensitive: boolean;
    sessions: Map<string, Remembered>;
}

/** By search key, least recently used first. */
const remembered = new Map<string, RememberedSearch>();

/** Forgets every remembered tally. For tests, and for a host whose store changed. */
export function resetCrossSearchCache(): void {
    remembered.clear();
}

function stampOf(session: LogSessionInfo): string {
    return `${session.lineCount}:${session.endedAt}`;
}

function rememberSearch(key: string, query: string, regex: boolean, caseSensitive: boolean): RememberedSearch {
    let entry = remembered.get(key);
    if (entry) {
        remembered.delete(key);
    } else {
        entry = { query, regex, caseSensitive, sessions: new Map() };
    }
    remembered.set(key, entry);
    for (const oldest of remembered.keys()) {
        if (remembered.size <= REMEMBERED_SEARCHES) break;
        remembered.delete(oldest);
    }
    return entry;
}

/**
 * Earlier plain searches the new one narrows: same case rule, and their text
 * is inside the new one's, so a log they found nothing in has nothing now.
 */
function narrowedSearches(query: string, regex: boolean, caseSensitive: boolean, key: string): RememberedSearch[] {
    if (regex) return [];
    const fold = (text: string) => (caseSensitive ? text : text.toLowerCase());
    const needle = fold(query);
    const result: RememberedSearch[] = [];
    remembered.forEach((search, searchKeyOf) => {
        if (searchKeyOf === key || search.regex || search.caseSensitive !== caseSensitive) return;
        if (needle.includes(fold(search.query))) result.push(search);
    });
    return result;
}

function isEmpty(tally: SessionTally): boolean {
    return Object.keys(tally).length === 0;
}

export function useCrossSearch({
    sessions,
    loadSession,
    loadSearchText,
    enabled,
    query,
    regex,
    caseSensitive,
    channels,
}: {
    sessions: LogSessionInfo[];
    loadSession?: (id: string) => Promise<LogSession | null>;
    /** A session's stored search text; preferred over `loadSession` when given. */
    loadSearchText?: (id: string) => Promise<SearchText | null>;
    /** Off outside All-logs scope, and while the host is still listing sessions. */
    enabled: boolean;
    query: string;
    regex: boolean;
    caseSensitive: boolean;
    channels: ChannelFilter;
}): CrossSearch | null {
    const [scan, setScan] = useState<Scan | null>(null);
    const key = searchKey(query, { regex, caseSensitive });
    const canLoad = Boolean(loadSession || loadSearchText);
    const wanted = enabled && canLoad && Boolean(makeMatcher(query, { regex, caseSensitive }).regex);

    useEffect(() => {
        const matcher = makeMatcher(query, { regex, caseSensitive });
        if (!enabled || !canLoad || !matcher.regex) {
            setScan(null);
            return;
        }
        const pattern = matcher.regex;
        const options = { regex, caseSensitive };
        // Sessions that came with their lines are counted by `deriveView`.
        const targets = orderSessions(sessions).filter((session) => !hasLines(session));
        const memory = rememberSearch(key, query, regex, caseSensitive);
        const narrowed = narrowedSearches(query, regex, caseSensitive, key);

        // What is already known is handed over at once, before any log is read.
        const tallies = new Map<string, SessionTally>();
        const pending: LogSessionInfo[] = [];
        for (const session of targets) {
            const stamp = stampOf(session);
            const known = memory.sessions.get(session.id);
            if (known && known.stamp === stamp) {
                tallies.set(session.id, known.tally);
                continue;
            }
            const ruledOut = narrowed.some((search) => {
                const earlier = search.sessions.get(session.id);
                return earlier !== undefined && earlier.stamp === stamp && isEmpty(earlier.tally);
            });
            if (ruledOut) {
                tallies.set(session.id, {});
                memory.sessions.set(session.id, { stamp, tally: {} });
                continue;
            }
            pending.push(session);
        }
        const known = targets.length - pending.length;
        setScan({ key, tallies: new Map(tallies), scanned: known, total: targets.length, running: pending.length > 0 });
        if (pending.length === 0) return;

        const tallyOf = async (id: string): Promise<SessionTally | null> => {
            if (loadSearchText) {
                const searchText = await loadSearchText(id);
                return searchText ? tallySearchText(searchText, query, options, pattern) : null;
            }
            const loaded = await loadSession!(id);
            return loaded ? tallySession(loaded.lines, query, options, pattern) : null;
        };

        let cancelled = false;
        const run = async () => {
            let published = performance.now();
            for (let index = 0; index < pending.length; index += 1) {
                const session = pending[index];
                let tally: SessionTally | null = null;
                try {
                    tally = await tallyOf(session.id);
                } catch {
                    // A log deleted under us counts as no hits.
                }
                if (cancelled) return;
                if (tally) {
                    tallies.set(session.id, tally);
                    memory.sessions.set(session.id, { stamp: stampOf(session), tally });
                }
                if (performance.now() - published > PUBLISH_EVERY_MS) {
                    setScan({ key, tallies: new Map(tallies), scanned: known + index + 1, total: targets.length, running: true });
                    published = performance.now();
                }
                // Reading and counting a big log is main-thread work; let input through.
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                if (cancelled) return;
            }
            setScan({ key, tallies: new Map(tallies), scanned: targets.length, total: targets.length, running: false });
        };
        const timer = window.setTimeout(() => void run(), START_DELAY_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
        // `key` is derived from the three below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, canLoad, loadSession, loadSearchText, sessions, query, regex, caseSensitive]);

    return useMemo(() => {
        if (!wanted) return null;
        // The render between a new query and the effect that starts its scan
        // still holds the last one's numbers: report it as under way rather
        // than let "0 w 0 logach" flash up.
        if (!scan || scan.key !== key) {
            return { hitsBySession: {}, matchEdges: {}, scanned: 0, total: sessions.length, running: true };
        }
        return { ...totalCrossHits(scan.tallies, channels), scanned: scan.scanned, total: scan.total, running: scan.running };
    }, [wanted, scan, key, channels, sessions.length]);
}

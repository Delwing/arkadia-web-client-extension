/**
 * Search across every log, for a list that does not hold its lines.
 *
 * A player's whole history does not fit in memory as parsed lines, so the
 * All-logs badges cannot be counted in the render the way the open session's
 * are. Instead each session is loaded through the host, reduced to a tally
 * (`model/crossHits.ts`) and let go, one after another.
 */
import { useEffect, useMemo, useState } from "react";
import type { ChannelFilter } from "./model/channels";
import { tallySession, totalCrossHits, type SessionTally } from "./model/crossHits";
import { makeMatcher } from "./model/search";
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

interface Scan {
    /** The search this scan is for; a scan for another one is not an answer. */
    key: string;
    tallies: Map<string, SessionTally>;
    scanned: number;
    total: number;
    running: boolean;
}

export function useCrossSearch({
    sessions,
    loadSession,
    enabled,
    query,
    regex,
    caseSensitive,
    channels,
}: {
    sessions: LogSessionInfo[];
    loadSession?: (id: string) => Promise<LogSession | null>;
    /** Off outside All-logs scope, and while the host is still listing sessions. */
    enabled: boolean;
    query: string;
    regex: boolean;
    caseSensitive: boolean;
    channels: ChannelFilter;
}): CrossSearch | null {
    const [scan, setScan] = useState<Scan | null>(null);
    const key = `${regex ? "r" : "p"}${caseSensitive ? "c" : "i"}:${query}`;
    const wanted = enabled && Boolean(loadSession) && Boolean(makeMatcher(query, { regex, caseSensitive }).regex);

    useEffect(() => {
        const matcher = makeMatcher(query, { regex, caseSensitive });
        if (!enabled || !loadSession || !matcher.regex) {
            setScan(null);
            return;
        }
        const pattern = matcher.regex;
        // Sessions that came with their lines are counted by `deriveView`.
        const targets = orderSessions(sessions).filter((session) => !hasLines(session));
        const tallies = new Map<string, SessionTally>();
        setScan({ key, tallies, scanned: 0, total: targets.length, running: targets.length > 0 });
        if (targets.length === 0) return;

        let cancelled = false;
        const run = async () => {
            let published = performance.now();
            for (let index = 0; index < targets.length; index += 1) {
                let loaded: LogSession | null = null;
                try {
                    loaded = await loadSession(targets[index].id);
                } catch {
                    // A log deleted under us counts as no hits.
                }
                if (cancelled) return;
                if (loaded) tallies.set(loaded.id, tallySession(loaded.lines, query, { regex, caseSensitive }, pattern));
                if (performance.now() - published > PUBLISH_EVERY_MS) {
                    setScan({ key, tallies: new Map(tallies), scanned: index + 1, total: targets.length, running: true });
                    published = performance.now();
                }
                // Parsing a big log is main-thread work; let input through.
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
    }, [enabled, loadSession, sessions, query, regex, caseSensitive]);

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

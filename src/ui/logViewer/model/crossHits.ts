/**
 * All-logs hit counts for sessions whose lines are not kept in memory.
 *
 * `useCrossSearch` reads each session, reduces it to a tally with
 * `tallySession`, and lets its lines go. What is kept is a few numbers per
 * channel, which is what lets a channel toggle re-total the badges with
 * `totalCrossHits` without reading a single log again.
 */
import { CHANNELS, type Channel, type ChannelFilter } from "./channels";
import { findLineHits } from "./search";
import type { LogLine } from "./types";
import type { CrossHits, MatchEdges } from "./viewerState";

/** A session's hits on one channel, with the lines the first and last are on. */
interface ChannelHits {
    count: number;
    firstLine: number;
    first?: string;
    lastLine: number;
    last?: string;
}

export type SessionTally = Partial<Record<Channel, ChannelHits>>;

export function tallySession(
    lines: readonly LogLine[],
    query: string,
    options: { regex: boolean; caseSensitive: boolean },
    regex: RegExp,
): SessionTally {
    const result: SessionTally = {};
    for (const hit of findLineHits(lines, query, options, regex)) {
        const line = lines[hit.line];
        const entry = result[line.channel];
        if (entry) {
            entry.count += hit.count;
            entry.lastLine = hit.line;
            entry.last = line.character;
        } else {
            result[line.channel] = {
                count: hit.count,
                firstLine: hit.line,
                first: line.character,
                lastLine: hit.line,
                last: line.character,
            };
        }
    }
    return result;
}

/** The badges and hand-over edges the tallies add up to under `channels`. */
export function totalCrossHits(tallies: ReadonlyMap<string, SessionTally>, channels: ChannelFilter): CrossHits {
    const hitsBySession: Record<string, number> = {};
    const matchEdges: Record<string, MatchEdges> = {};
    tallies.forEach((perChannel, id) => {
        let total = 0;
        let firstLine = Infinity;
        let lastLine = -1;
        const edges: MatchEdges = {};
        for (const channel of CHANNELS) {
            const entry = perChannel[channel];
            if (!entry || !channels[channel]) continue;
            total += entry.count;
            if (entry.firstLine < firstLine) {
                firstLine = entry.firstLine;
                edges.first = entry.first;
            }
            if (entry.lastLine > lastLine) {
                lastLine = entry.lastLine;
                edges.last = entry.last;
            }
        }
        hitsBySession[id] = total;
        matchEdges[id] = edges;
    });
    return { hitsBySession, matchEdges };
}

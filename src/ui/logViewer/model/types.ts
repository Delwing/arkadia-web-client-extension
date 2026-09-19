/**
 * The log viewer's data model.
 *
 * A `LogSession` is one recorded play session; a `LogLine` is one rendered line
 * of it. Both are view-layer shapes: the adapter that reads the client's log
 * store (see `log-viewer/sessionAdapter.ts`) is what turns stored records into
 * these, so the viewer never touches IndexedDB itself and can be driven from
 * mock data in the showcase.
 */
import type { Channel } from "./channels";
import type { LogEventKind } from "./events";

export interface LogLine {
    /** Original line number in the session, 1-based and stable across filters. */
    number: number;
    /** Event time in epoch ms — a log is a record of the game, not of arrival. */
    timestamp: number;
    channel: Channel;
    /** Plain text, used for search and copy. */
    text: string;
    /**
     * Pre-rendered HTML with the game's own colours, when the record has it.
     * Only shown when the player turns ANSI colours on; search always works on
     * `text`.
     */
    html?: string;
    event?: LogEventKind;
}

export interface LogSession {
    id: string;
    /** Character name, or the session's own label when it is not known. */
    character: string;
    /** Day heading this session is grouped under ("Dzisiaj · sob 19 wrz"). */
    dayLabel: string;
    /** Full date, for the header meta line. */
    dateLabel: string;
    startedAt: number;
    endedAt: number;
    /** True while this session is still being recorded. */
    live: boolean;
    /** File name the session exports as. */
    file: string;
    lines: LogLine[];
}

export type SearchScope = "log" | "all";
export type Density = "compact" | "comfortable";

/**
 * A slice of a session, as a span of TIME rather than a pair of line indices.
 *
 * Time is what the timeline handles move along, and it is what survives a
 * change of channel filters: narrowing to "20:31 to 20:40" still means the same
 * moment after you hide the combat channel, where line 900 does not.
 */
export interface TimeRange {
    from: number;
    to: number;
}

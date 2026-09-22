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
    /**
     * The character playing when this line was written, when it is known.
     * Undefined is normal: a log can start before anyone logged in, and old
     * logs give up a name only where the login banner names one.
     */
    character?: string;
}

export interface LogSession {
    id: string;
    /**
     * Characters played in this session, in order of first appearance.
     *
     * A list rather than a name: the log runs from page load to page close, so
     * one session can span a re-login. It is empty for a session that never
     * reached the game, and for old logs whose character could not be
     * recognised — both are normal, and the date label stands in.
     */
    characters: string[];
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
    /**
     * The main output window's background while this session was recorded
     * (the last one, if the player changed it), so the log reads on the ground
     * it was played on. Undefined for logs recorded before the client stamped
     * it; the viewer then uses the current one.
     */
    background?: string;
    lines: LogLine[];
}

/**
 * Where a search looks — and, for `range`, what the viewer shows.
 *
 * `log` and `all` differ only in how many sessions they cover. `range` is the
 * odd one out: it is the scope in which a selected slice is APPLIED, so the
 * rows, the counter, the timeline and every export narrow to it together. The
 * other two leave the slice drawn on the timeline but show the whole log, which
 * is what makes "szukaj w calym logu" mean what it says while a range exists.
 *
 * It is offered only when there IS a range, and falls back to `log` if the
 * range goes away underneath it (`effectiveScope`).
 */
export type SearchScope = "log" | "all" | "range";

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

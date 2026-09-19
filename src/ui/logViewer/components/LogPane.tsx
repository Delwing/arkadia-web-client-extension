import { useCallback, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button, EmptyState } from "@design";
import { CHANNEL_META } from "../model/channels";
import { LOG_EVENT_META } from "../model/events";
import { formatClock } from "../model/format";
import type { RenderedRow } from "../model/viewerState";

export interface LogPaneProps {
    rows: RenderedRow[];
    showTimestamps: boolean;
    showColors: boolean;
    wrap: boolean;
    lineHeight: number;
    currentRow: number | null;
    /** Which highlight within the current row is *the* current match. */
    currentOccurrence: number;
    emptyMessage: string | null;
    onResetFilters: () => void;
    /** Reports the time range on screen, for the timeline's viewport box. */
    onViewportChange: (range: { from: number; to: number } | null) => void;
    /** Fires when the player scrolls away from the bottom — turns follow off. */
    onScrollAwayFromBottom: () => void;
    follow: boolean;
    /** Bumped by the parent to request a scroll; see `LogViewer`. */
    scrollRequest: ScrollRequest | null;
}

export interface ScrollRequest {
    /** Distinguishes two requests for the same target — each one must scroll. */
    token: number;
    kind: "row" | "top" | "bottom";
    row?: number;
    align?: "start" | "center";
}

/** How far up from the bottom counts as "the player took over". */
const FOLLOW_RELEASE_PX = 48;

/**
 * How long after a scroll WE asked for the pane keeps ignoring scroll events.
 *
 * Without this, following live switches itself off the moment it is turned on:
 * the jump to the bottom fires scroll events from wherever the pane happens to
 * be, which look exactly like the player scrolling up.
 */
const PROGRAMMATIC_SCROLL_GRACE_MS = 300;

export function LogPane({
    rows,
    showTimestamps,
    showColors,
    wrap,
    lineHeight,
    currentRow,
    currentOccurrence,
    emptyMessage,
    onResetFilters,
    onViewportChange,
    onScrollAwayFromBottom,
    follow,
    scrollRequest,
}: LogPaneProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastRequest = useRef<number>(-1);
    const ignoreScrollUntil = useRef(0);

    const markProgrammaticScroll = useCallback(() => {
        ignoreScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_GRACE_MS;
    }, []);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => lineHeight,
        overscan: 24,
        // With wrapping on a row can be several lines tall, so measured heights
        // are the only way the scrollbar and the viewport box stay honest.
        measureElement: wrap ? undefined : () => lineHeight,
    });

    const virtualRows = virtualizer.getVirtualItems();

    // Viewport range, from the virtualizer rather than from the DOM: with rows
    // unmounted outside the window there is nothing in the DOM to scan.
    useEffect(() => {
        if (virtualRows.length === 0 || rows.length === 0) {
            onViewportChange(null);
            return;
        }
        const first = rows[virtualRows[0].index];
        const last = rows[virtualRows[virtualRows.length - 1].index];
        if (first && last) onViewportChange({ from: first.timestamp, to: last.timestamp });
    }, [virtualRows, rows, onViewportChange]);

    // Follow live: pin to the bottom as lines arrive.
    useEffect(() => {
        if (!follow || rows.length === 0) return;
        markProgrammaticScroll();
        virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
    }, [follow, rows.length, virtualizer, markProgrammaticScroll]);

    useEffect(() => {
        if (!scrollRequest || scrollRequest.token === lastRequest.current) return;
        lastRequest.current = scrollRequest.token;
        markProgrammaticScroll();
        if (scrollRequest.kind === "top") {
            scrollRef.current?.scrollTo({ top: 0 });
        } else if (scrollRequest.kind === "bottom") {
            if (rows.length) virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
        } else if (scrollRequest.row !== undefined && rows.length) {
            virtualizer.scrollToIndex(Math.min(scrollRequest.row, rows.length - 1), {
                align: scrollRequest.align ?? "center",
            });
        }
    }, [scrollRequest, rows.length, virtualizer, markProgrammaticScroll]);

    const grid = useMemo(() => ({ minHeight: `${virtualizer.getTotalSize()}px` }), [virtualizer]);

    if (emptyMessage) {
        return (
            <div className="lv-log lv-log--empty" ref={scrollRef}>
                <EmptyState
                    message={emptyMessage}
                    action={
                        <Button size="sm" onClick={onResetFilters}>
                            Zresetuj filtry
                        </Button>
                    }
                />
            </div>
        );
    }

    return (
        <div
            className="lv-log"
            ref={scrollRef}
            data-timestamps={showTimestamps}
            data-wrap={wrap}
            onScroll={(event) => {
                if (!follow) return;
                if (Date.now() < ignoreScrollUntil.current) return;
                const element = event.currentTarget;
                if (element.scrollTop + element.clientHeight < element.scrollHeight - FOLLOW_RELEASE_PX) {
                    onScrollAwayFromBottom();
                }
            }}
        >
            <div style={{ ...grid, position: "relative" }}>
                {virtualRows.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    if (!row) return null;
                    const isCurrentRow = currentRow === virtualRow.index;
                    const eventMeta = row.event
                        ? LOG_EVENT_META[row.event as keyof typeof LOG_EVENT_META]
                        : undefined;
                    let occurrence = -1;
                    return (
                        <div
                            key={virtualRow.key}
                            ref={wrap ? virtualizer.measureElement : undefined}
                            data-index={virtualRow.index}
                            className="lv-log__row"
                            data-current={isCurrentRow}
                            data-event={Boolean(eventMeta)}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            {showTimestamps ? (
                                <span className="lv-log__time">{formatClock(row.timestamp)}</span>
                            ) : null}
                            <span className="lv-log__number">{row.number}</span>
                            <span
                                className="lv-log__tag"
                                data-event={Boolean(eventMeta)}
                                style={eventMeta ? { color: eventMeta.colorToken } : undefined}
                            >
                                {eventMeta ? eventMeta.tag : CHANNEL_META[row.channel].tag}
                            </span>
                            <div
                                className="lv-log__text"
                                style={{ color: CHANNEL_META[row.channel].colorToken }}
                                title={wrap ? undefined : row.text}
                            >
                                {showColors && row.html && row.matchCount === 0 ? (
                                    // The stored HTML carries the game's own colours. It is only
                                    // used when nothing has to be highlighted inside it: mixing
                                    // marks into pre-rendered markup would mean parsing it.
                                    <span dangerouslySetInnerHTML={{ __html: row.html }} />
                                ) : (
                                    row.segments.map((segment, index) => {
                                        if (!segment.match) {
                                            return <span key={index}>{segment.text}</span>;
                                        }
                                        occurrence += 1;
                                        return (
                                            <mark
                                                key={index}
                                                data-current={isCurrentRow && occurrence === currentOccurrence}
                                            >
                                                {segment.text}
                                            </mark>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

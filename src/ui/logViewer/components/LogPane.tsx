import { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button, EmptyState } from "@design";
import { CHANNEL_META } from "../model/channels";
import { LOG_EVENT_META } from "../model/events";
import { formatClock } from "../model/format";
import type { RenderedRow } from "../model/viewerState";

export interface LogPaneProps {
    rows: RenderedRow[];
    showTimestamps: boolean;
    /** Tag and line-number columns, shown or hidden together. */
    showMeta: boolean;
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
    /** Right-click on a row — opens the range menu. */
    onLineContextMenu: (event: React.MouseEvent, row: RenderedRow) => void;
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
    showMeta,
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
    onLineContextMenu,
}: LogPaneProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastRequest = useRef<number>(-1);
    const ignoreScrollUntil = useRef(0);

    const markProgrammaticScroll = useCallback(() => {
        ignoreScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_GRACE_MS;
    }, []);

    /**
     * Row identity carries the settings that decide a row's height.
     *
     * The virtualizer caches a measured size per item KEY and keeps it until
     * the key stops matching. With the default key (the index), switching
     * density left every offset stepping by the OLD line height while the rows
     * were drawn at the new one — 26px rows laid out 21px apart, overlapping by
     * five pixels each. Folding the height-deciding settings into the key
     * invalidates exactly the stale entries, and does it declaratively rather
     * than depending on an effect firing before the next paint.
     */
    const getItemKey = useCallback(
        (index: number) => `${wrap ? "w" : "n"}${lineHeight}:${index}`,
        [wrap, lineHeight],
    );

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => lineHeight,
        overscan: 24,
        getItemKey,
    });

    const virtualRows = virtualizer.getVirtualItems();

    /*
     * Mirrors of the current render, read by the scroll handler below. The
     * handler is installed once and must see the latest items and rows without
     * being re-created on every render.
     */
    const virtualRowsRef = useRef(virtualRows);
    virtualRowsRef.current = virtualRows;
    const rowsRef = useRef(rows);
    rowsRef.current = rows;
    const sizerRef = useRef<HTMLDivElement>(null);

    /**
     * Reports the time range genuinely on screen, for the timeline's "Widok" box.
     *
     * Two things make this less obvious than it looks:
     *
     * 1. `getVirtualItems()` returns the rendered window, which includes the
     *    overscan buffer above and below — about twice the viewport. Reporting
     *    its first and last item made the box roughly three times too wide.
     *    So the items are filtered to those that actually intersect the scroll
     *    viewport. The rendered set always covers the visible window, so this
     *    never comes up short.
     *
     * 2. The virtualizer only notifies when the rendered RANGE changes, so
     *    scrolling inside the overscan buffer triggers no re-render at all.
     *    That is why this is driven from the scroll event rather than from a
     *    dependency on the virtual items.
     */
    const reportViewport = useCallback(() => {
        const element = scrollRef.current;
        const items = virtualRowsRef.current;
        const currentRows = rowsRef.current;
        if (!element || items.length === 0 || currentRows.length === 0) {
            onViewportChange(null);
            return;
        }

        // Measured against the sizer, not against `scrollTop`: the pane has top
        // padding, so the virtualizer's offsets (which start at the sizer) and
        // `scrollTop` (which starts at the padding box) are a few pixels apart.
        // Using rects sidesteps that entirely, and they already reflect the
        // current scroll position.
        const sizer = sizerRef.current;
        if (!sizer) return;
        const top = element.getBoundingClientRect().top - sizer.getBoundingClientRect().top;
        const bottom = top + element.clientHeight;
        let first: RenderedRow | undefined;
        let last: RenderedRow | undefined;
        for (const item of items) {
            if (item.start + item.size <= top || item.start >= bottom) continue;
            const row = currentRows[item.index];
            if (!row) continue;
            first ??= row;
            last = row;
        }

        // Scrolled into padding with nothing intersecting: fall back to the
        // nearest rendered row rather than blanking the box.
        if (!first || !last) {
            const fallback = currentRows[items[0].index];
            if (!fallback) return;
            onViewportChange({ from: fallback.timestamp, to: fallback.timestamp });
            return;
        }
        onViewportChange({ from: first.timestamp, to: last.timestamp });
    }, [onViewportChange]);

    // Covers everything that is not a scroll: a new range, a channel filter,
    // a density change, lines arriving.
    useEffect(() => {
        reportViewport();
    }, [virtualRows, rows, reportViewport]);

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

    /**
     * Recomputed every render, deliberately NOT memoised on `virtualizer`:
     * that object keeps the same identity for the life of the component, so a
     * memo keyed on it freezes the scroll height at whatever the FIRST render
     * measured. Every later change to the row count — a range, a channel
     * filter, "matching lines only" — then left the pane with a stale scroll
     * height, and a shrinking list simply rendered blank because the scroll
     * position was past the end of the real content.
     */
    const totalSize = virtualizer.getTotalSize();

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
            data-meta={showMeta}
            data-wrap={wrap}
            onScroll={(event) => {
                reportViewport();
                if (!follow) return;
                if (Date.now() < ignoreScrollUntil.current) return;
                const element = event.currentTarget;
                if (element.scrollTop + element.clientHeight < element.scrollHeight - FOLLOW_RELEASE_PX) {
                    onScrollAwayFromBottom();
                }
            }}
        >
            <div ref={sizerRef} style={{ minHeight: `${totalSize}px`, position: "relative" }}>
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
                            onContextMenu={(event) => onLineContextMenu(event, row)}
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
                            {showMeta ? (
                                <>
                                    <span className="lv-log__number">{row.number}</span>
                                    <span
                                        className="lv-log__tag"
                                        data-event={Boolean(eventMeta)}
                                        style={eventMeta ? { color: eventMeta.colorToken } : undefined}
                                    >
                                        {eventMeta ? eventMeta.tag : CHANNEL_META[row.channel].tag}
                                    </span>
                                </>
                            ) : null}
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

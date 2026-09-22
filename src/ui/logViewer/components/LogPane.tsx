import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button, EmptyState } from "../ui";
import { CHANNEL_META } from "../model/channels";
import { LOG_EVENT_META } from "../model/events";
import { formatClock } from "../model/format";
import type { RenderedRow } from "../model/viewerState";

export interface LogPaneProps {
    rows: RenderedRow[];
    /**
     * Identity of the session the rows come from.
     *
     * Rows are keyed by their index in the session, which is stable across
     * filters but collides across sessions — this is what tells the pane that
     * line 40 is now a different line and every measured height is stale.
     */
    sessionKey?: string;
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
    /**
     * Replaces "Zresetuj filtry" when no filter is what emptied the pane.
     * `null`/undefined leaves the empty state without an action; see
     * `LogViewer` for who supplies one.
     */
    emptyAction?: React.ReactNode;
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
    /**
     * The output background the session was recorded with. Without one the
     * pane takes the client's current output background (`--output-bg`).
     */
    background?: string;
}

/** A CSS colour the pane can use, or undefined for anything else. */
function usableColor(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return value;
    return CSS.supports("color", value) ? value : undefined;
}

/**
 * Whether a computed `rgb()`/`rgba()` colour is dark or light, so the text
 * over it can be picked to match. Null when it cannot be read.
 */
export function groundOf(computed: string): "dark" | "light" | null {
    const channels = computed.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    if (!channels) return null;
    const [r, g, b] = channels.slice(1, 4).map((value) => {
        const c = Number(value) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? "light" : "dark";
}

export interface ScrollRequest {
    /** Distinguishes two requests for the same target — each one must scroll. */
    token: number;
    kind: "row" | "top" | "bottom" | "page";
    row?: number;
    align?: "start" | "center";
    /** For `page`: one viewport down (1) or up (-1). */
    delta?: 1 | -1;
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

/** Rows the paging keys keep on screen, so a page turn still has a seam. */
const PAGE_OVERLAP_PX = 40;

/**
 * A monospace sample, long enough that rounding one character's width does not
 * throw the estimate off across a whole line.
 */
const PROBE_SAMPLE = "0123456789".repeat(4);

interface LineMetrics {
    /** Characters that fit on one visual line of the text column. */
    cols: number;
    /** Height of one visual line, as the browser actually laid it out. */
    rowHeight: number;
}

export function LogPane({
    rows,
    sessionKey,
    showTimestamps,
    showMeta,
    showColors,
    wrap,
    lineHeight,
    currentRow,
    currentOccurrence,
    emptyMessage,
    emptyAction,
    onResetFilters,
    onViewportChange,
    onScrollAwayFromBottom,
    follow,
    scrollRequest,
    onLineContextMenu,
    background,
}: LogPaneProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const color = usableColor(background);
    const [ground, setGround] = useState<"dark" | "light" | null>(null);
    const probeRef = useRef<HTMLDivElement>(null);
    const lastRequest = useRef<number>(-1);
    const ignoreScrollUntil = useRef(0);
    const [metrics, setMetrics] = useState<LineMetrics | null>(null);

    const markProgrammaticScroll = useCallback(() => {
        ignoreScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_GRACE_MS;
    }, []);

    /**
     * Dark or light text, for whichever background the pane ended up on: the
     * recorded one, the client's current one, or the theme's.
     */
    const hasRows = !emptyMessage;
    useLayoutEffect(() => {
        const element = scrollRef.current;
        if (!element || !hasRows) return;
        setGround(groundOf(getComputedStyle(element).backgroundColor));
    }, [color, hasRows]);

    /**
     * Measures the text column and one character of it, from a hidden row that
     * goes through the same grid as the real ones.
     *
     * The estimate below needs real numbers rather than a constant: which
     * columns are on and how wide the pane is both move the
     * point at which a line wraps.
     */
    useLayoutEffect(() => {
        const element = scrollRef.current;
        const probe = probeRef.current;
        if (!element || !probe) return;
        const measure = () => {
            const cell = probe.querySelector<HTMLElement>(".lv-log__text");
            const sample = probe.querySelector<HTMLElement>(".lv-log__probe-text");
            if (!cell || !sample) return;
            const available = cell.getBoundingClientRect().width;
            const sampleWidth = sample.getBoundingClientRect().width;
            const rowHeight = probe.getBoundingClientRect().height;
            // A pane that has not been laid out yet (jsdom, or a hidden host)
            // measures zero. Leaving the metrics null falls the estimate back
            // to the fixed line height rather than dividing by nothing.
            if (available <= 0 || sampleWidth <= 0 || rowHeight <= 0) return;
            const cols = Math.max(10, Math.floor(available / (sampleWidth / PROBE_SAMPLE.length)));
            setMetrics((previous) =>
                previous && previous.cols === cols && previous.rowHeight === rowHeight
                    ? previous
                    : { cols, rowHeight },
            );
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        observer.observe(probe);
        return () => observer.disconnect();
    }, [showTimestamps, showMeta, lineHeight, emptyMessage]);

    /**
     * A wrapped line is as tall as the number of visual lines it takes.
     *
     * Rows are measured once they render, but everything above the viewport is
     * only ever estimated — so the estimate is what decides where a jump lands
     * and how steady the scrollbar is while you drag it. One fixed height for a
     * log where every fourth line wraps three times puts the scrollbar and the
     * content minutes apart. Taken from `LogBrowser.tsx:935`.
     */
    const estimateSize = useCallback(
        (index: number) => {
            if (!wrap || !metrics) return lineHeight;
            const length = rows[index]?.text.length ?? 0;
            return Math.max(1, Math.ceil(length / metrics.cols)) * metrics.rowHeight;
        },
        [wrap, metrics, rows, lineHeight],
    );

    /**
     * Row identity is the line's index in the session, not its index in `rows`.
     *
     * Measured heights are cached per key, and a wrapped line's height belongs
     * to the LINE: keeping it keyed that way means toggling a channel filter or
     * narrowing to a range does not throw away every measurement the pane has
     * taken. Folding the height-deciding settings into the key instead (which
     * is how the overlapping-rows bug was first fixed) would invalidate the
     * whole cache on every layout change AND still leave variable heights
     * re-measuring from scratch on a filter change.
     *
     * The price is that the cache now has to be invalidated explicitly — see
     * the effect below. It is not optional: without it, a layout change leaves
     * every offset stepping by the old height while the rows are drawn at the
     * new one, and they overlap.
     */
    const getItemKey = useCallback((index: number) => rows[index]?.lineIndex ?? index, [rows]);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize,
        overscan: 24,
        getItemKey,
    });

    /**
     * Drops every measured height when the thing that decided it changes.
     *
     * The virtualizer memoises its measurements on the item keys and the size
     * cache, NOT on `estimateSize` — a new estimator alone changes nothing.
     * `measure()` empties the cache, which is the dependency that does.
     */
    useEffect(() => {
        virtualizer.measure();
    }, [virtualizer, metrics, wrap, lineHeight, sessionKey]);

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
     *
     * It reads each item's own `start` and `size`, so it goes on holding once
     * those stop being a multiple of one fixed line height.
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
    // a layout change, lines arriving.
    useEffect(() => {
        reportViewport();
    }, [virtualRows, rows, reportViewport]);

    /* --- scrolling to a row ---------------------------------------------- */

    const scrollJob = useRef<number | null>(null);

    const cancelScrollJob = useCallback(() => {
        if (scrollJob.current !== null) cancelAnimationFrame(scrollJob.current);
        scrollJob.current = null;
    }, []);

    /**
     * Scrolls a row into view, re-aiming each frame until the offset holds.
     *
     * Rows above the target are only estimated until they render, so the offset
     * a jump is aimed at moves as the list measures itself. The virtualizer's
     * own `scrollToIndex` copes badly with that: it keeps re-snapping to the
     * target for seconds, fighting a player who scrolls away in the meantime,
     * and it gives up when the scroll is clamped by a list that has not grown
     * yet — which is why a hit in another session needed a second click. This
     * re-reads the offset instead, stops as soon as it is stable, and is
     * abandoned the moment the player touches the pane. From
     * `LogBrowser.tsx:1119`.
     */
    const scrollToRow = useCallback(
        (index: number, align: "start" | "center" | "end") => {
            cancelScrollJob();
            const element = scrollRef.current;
            if (!element) return;
            let stable = 0;
            let frames = 0;
            const step = () => {
                scrollJob.current = null;
                // Re-armed every frame: the job outlives a single grace window,
                // and each of its own scrolls must stay invisible to follow.
                markProgrammaticScroll();
                const offset = virtualizer.getOffsetForIndex(index, align);
                if (!offset) return;
                const target = Math.max(0, Math.min(offset[0], element.scrollHeight - element.clientHeight));
                if (Math.abs(element.scrollTop - target) <= 1) stable += 1;
                else {
                    stable = 0;
                    element.scrollTop = target;
                }
                if (stable >= 3 || (frames += 1) > 60) return;
                scrollJob.current = requestAnimationFrame(step);
            };
            step();
        },
        [virtualizer, cancelScrollJob, markProgrammaticScroll],
    );

    // Any input of the player's own in the pane abandons a running jump.
    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        const events = ["wheel", "pointerdown", "touchstart", "keydown"] as const;
        for (const type of events) element.addEventListener(type, cancelScrollJob, { passive: true });
        return () => {
            for (const type of events) element.removeEventListener(type, cancelScrollJob);
            cancelScrollJob();
        };
    }, [cancelScrollJob, emptyMessage]);

    // Follow live: pin to the bottom as lines arrive.
    useEffect(() => {
        if (!follow || rows.length === 0) return;
        scrollToRow(rows.length - 1, "end");
    }, [follow, rows.length, scrollToRow]);

    useEffect(() => {
        if (!scrollRequest || scrollRequest.token === lastRequest.current) return;
        lastRequest.current = scrollRequest.token;
        const element = scrollRef.current;
        if (scrollRequest.kind === "page") {
            // Paging is a plain scroll, deliberately not marked programmatic:
            // paging up off the bottom should release follow just as dragging
            // the scrollbar does.
            cancelScrollJob();
            if (!element) return;
            const page = Math.max(20, element.clientHeight - PAGE_OVERLAP_PX);
            element.scrollTop += page * (scrollRequest.delta ?? 1);
            return;
        }
        markProgrammaticScroll();
        if (scrollRequest.kind === "top") {
            cancelScrollJob();
            element?.scrollTo({ top: 0 });
        } else if (scrollRequest.kind === "bottom") {
            if (rows.length) scrollToRow(rows.length - 1, "end");
        } else if (scrollRequest.row !== undefined && rows.length) {
            scrollToRow(Math.min(scrollRequest.row, rows.length - 1), scrollRequest.align ?? "center");
        }
    }, [scrollRequest, rows.length, scrollToRow, cancelScrollJob, markProgrammaticScroll]);

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
                        emptyAction === undefined ? (
                            <Button size="sm" onClick={onResetFilters}>
                                Zresetuj filtry
                            </Button>
                        ) : (
                            emptyAction
                        )
                    }
                />
            </div>
        );
    }

    return (
        <div
            className="lv-log"
            ref={scrollRef}
            style={color ? ({ "--lv-bg-log": color } as React.CSSProperties) : undefined}
            data-ground={ground ?? undefined}
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

            {/* Hidden, laid out by the same grid as a real row — see the
                measuring effect above. */}
            <div className="lv-log__probe" ref={probeRef}>
                {showTimestamps ? <span className="lv-log__time">00:00:00</span> : null}
                {showMeta ? (
                    <>
                        <span className="lv-log__number">0000</span>
                        <span className="lv-log__tag">ROZM</span>
                    </>
                ) : null}
                <div className="lv-log__text">
                    <span className="lv-log__probe-text">{PROBE_SAMPLE}</span>
                </div>
            </div>
        </div>
    );
}

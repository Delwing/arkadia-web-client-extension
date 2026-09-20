import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Icon, IconButton } from "../ui";
import { LOG_EVENT_KINDS, LOG_EVENT_META } from "../model/events";
import { formatAxisLabel, formatClock, formatDuration, pluralLines } from "../model/format";
import {
    buildAxisTicks,
    buildHistogram,
    buildMatchTicks,
    countNear,
    findIdleGaps,
    percentOf,
    spanOf,
    viewportBox,
} from "../model/timeline";
import type { LogLine, TimeRange } from "../model/types";

export interface TimelineProps {
    /** Every line in the session — idle gaps and the span come from these. */
    allLines: LogLine[];
    /**
     * Lines passing the channel and search filters but NOT the range — the
     * histogram draws these. Filtering them by the range too would empty the
     * part of the track you need to see in order to move the range.
     */
    activityLines: LogLine[];
    live: boolean;
    matchTimestamps: number[];
    currentMatchTimestamp: number | null;
    /** Time range of the rows on screen, or null before the first measure. */
    viewport: { from: number; to: number } | null;
    onJumpToTime: (timestamp: number, align: "start" | "center") => void;
    onJumpToStart: () => void;
    onJumpToEnd: () => void;
    /** Selected slice of the session, or null for the whole of it. */
    range: TimeRange | null;
    /**
     * Whether the slice is currently narrowing the log — it only does so in
     * "Zakres" search scope. A slice that is merely selected keeps its handles
     * so it can be adjusted and picked up again, but it does not scrim the
     * track: nothing outside it is hidden.
     */
    rangeActive: boolean;
    onRangeChange: (range: TimeRange | null) => void;
}

/** Past this point a hover tooltip would run off the right edge, so it flips. */
const TOOLTIP_FLIP_AT = 0.78;

/** The same, in percent, for the name written next to a login marker. */
const NAME_FLIP_AT = 78;

/**
 * Which login markers write the character's name next to them.
 *
 * Only where it says something: a session with one character has it in the
 * header already, and a login prints several `system.login` lines in a row,
 * which would stack the same name on top of itself. So the name goes on the
 * first marker of each character — which is exactly where the switch is.
 */
function namedLogins(events: LogLine[]): Set<number> {
    const first = new Set<number>();
    const distinct = new Set<string>();
    let previous: string | undefined;
    for (const line of events) {
        if (line.event !== "login") continue;
        if (line.character && line.character !== previous) {
            first.add(line.number);
            distinct.add(line.character);
        }
        previous = line.character;
    }
    return distinct.size > 1 ? first : new Set();
}

/**
 * Movement, in pixels, that separates a click from a drag on the track.
 *
 * The track carries both gestures: a click jumps to that moment, a drag selects
 * a range. Without a threshold the jump would fire on every range drag, because
 * a drag begins as a press.
 */
const DRAG_THRESHOLD_PX = 4;

export function Timeline({
    allLines,
    activityLines,
    live,
    matchTimestamps,
    currentMatchTimestamp,
    viewport,
    onJumpToTime,
    onJumpToStart,
    onJumpToEnd,
    range,
    rangeActive,
    onRangeChange,
}: TimelineProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [hover, setHover] = useState<number | null>(null);
    const [selecting, setSelecting] = useState(false);

    /**
     * Live drag state. A ref rather than state: the window listeners below are
     * installed once and must not close over a stale snapshot, and a pointer
     * move should not re-render anything but the range it emits.
     */
    const drag = useRef<{
        mode: "track" | "handle";
        edge: "from" | "to";
        /** Anchor for a track drag — the moment the press landed on. */
        anchor: number;
        startX: number;
        exceeded: boolean;
    } | null>(null);

    const span = spanOf(allLines, live);
    const buckets = buildHistogram(activityLines, span);
    const gaps = findIdleGaps(allLines, span);
    const ticks = buildMatchTicks(matchTimestamps, span);
    const axis = buildAxisTicks(span);
    const events = allLines.filter((line) => line.event);
    const named = namedLogins(events);
    const box = viewport ? viewportBox(viewport.from, viewport.to, span) : null;

    const fractionFromEvent = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    }, []);

    const timeFromClientX = useCallback(
        (clientX: number) => {
            const rect = trackRef.current?.getBoundingClientRect();
            if (!rect || rect.width === 0) return span.from;
            const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            return Math.round(span.from + span.duration * fraction);
        },
        [span.from, span.duration],
    );

    /** Collapses back to "no range" once the slice covers the whole session. */
    const emitRange = useCallback(
        (from: number, to: number) => {
            const lo = Math.min(from, to);
            const hi = Math.max(from, to);
            if (lo <= span.from && hi >= span.to) onRangeChange(null);
            else onRangeChange({ from: lo, to: hi });
        },
        [span.from, span.to, onRangeChange],
    );

    const rangeFrom = range?.from ?? span.from;
    const rangeTo = range?.to ?? span.to;

    // Window-level listeners so a drag keeps working once the pointer leaves
    // the track, and still ends if the button is released outside the window.
    useEffect(() => {
        const onMove = (event: PointerEvent) => {
            const state = drag.current;
            if (!state) return;
            if (!state.exceeded) {
                if (Math.abs(event.clientX - state.startX) < DRAG_THRESHOLD_PX) return;
                state.exceeded = true;
                if (state.mode === "track") setSelecting(true);
            }
            const timestamp = timeFromClientX(event.clientX);
            if (state.mode === "track") {
                emitRange(state.anchor, timestamp);
            } else if (state.edge === "from") {
                emitRange(Math.min(timestamp, rangeTo), rangeTo);
            } else {
                emitRange(rangeFrom, Math.max(timestamp, rangeFrom));
            }
        };

        const onUp = (event: PointerEvent) => {
            const state = drag.current;
            drag.current = null;
            setSelecting(false);
            if (!state) return;
            // A press that never moved is a click: jump there, as before.
            if (state.mode === "track" && !state.exceeded) {
                onJumpToTime(timeFromClientX(event.clientX), "start");
            }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
    }, [timeFromClientX, emitRange, onJumpToTime, rangeFrom, rangeTo]);

    const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        // Only the primary button drives selection; right-click belongs to the
        // browser menu and middle-click to nothing here.
        if (event.button !== 0) return;
        drag.current = {
            mode: "track",
            edge: "from",
            anchor: timeFromClientX(event.clientX),
            startX: event.clientX,
            exceeded: false,
        };
    };

    const onHandlePointerDown = (edge: "from" | "to") => (event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        drag.current = { mode: "handle", edge, anchor: 0, startX: event.clientX, exceeded: true };
    };

    const hoverTimestamp = hover === null ? null : span.from + span.duration * hover;

    return (
        <div className="lv-timeline">
            <div className="lv-timeline__head">
                <span className="lv-timeline__title">Os czasu</span>
                <span className="lv-timeline__span">
                    {formatClock(span.from)} {"→"} {live ? "teraz" : formatClock(span.to)}
                    {"  ·  "}
                    {formatDuration(span.duration)}
                </span>
                <div className="lv-spacer" />
                <div className="lv-legend">
                    <span className="lv-legend__item">
                        <span className="lv-legend__swatch" />
                        Aktywnosc
                    </span>
                    <span className="lv-legend__item">
                        <span className="lv-legend__swatch lv-legend__swatch--match" />
                        Trafienia
                    </span>
                    <span className="lv-legend__item">
                        <span className="lv-legend__swatch lv-legend__swatch--view" />
                        Widok
                    </span>
                    <span className="lv-legend__item">
                        <span className="lv-legend__swatch lv-legend__swatch--idle" />
                        Bezczynnosc
                    </span>
                    {LOG_EVENT_KINDS.map((kind) => (
                        <span key={kind} className="lv-legend__item">
                            <span
                                className="lv-legend__glyph"
                                style={{ color: LOG_EVENT_META[kind].colorToken }}
                            >
                                {LOG_EVENT_META[kind].glyph}
                            </span>
                            {LOG_EVENT_META[kind].label}
                        </span>
                    ))}
                </div>
            </div>

            <div className="lv-timeline__row">
                <IconButton title="Skocz na poczatek  Home" onClick={onJumpToStart}>
                    <Icon name="jump-start" />
                </IconButton>

                <div
                    ref={trackRef}
                    className="lv-track"
                    data-selecting={selecting}
                    title="Kliknij, aby przejsc do tego momentu. Przeciagnij, aby zaznaczyc zakres."
                    onPointerDown={onTrackPointerDown}
                    onMouseMove={(event) => {
                        const fraction = fractionFromEvent(event);
                        setHover((previous) =>
                            previous === null || Math.abs(previous - fraction) > 0.003 ? fraction : previous,
                        );
                    }}
                    onMouseLeave={() => setHover(null)}
                >
                    {gaps.map((gap) => (
                        <div
                            key={`gap-${gap.left}`}
                            className="lv-track__gap"
                            style={{ left: `${gap.left}%`, width: `${gap.width}%` }}
                            title={`Bezczynnosc przez ${formatDuration(gap.durationMs)}`}
                        />
                    ))}

                    <div className="lv-track__bars">
                        {buckets.map((bucket) => (
                            <div
                                key={`bar-${bucket.left}`}
                                className="lv-track__bar"
                                style={{
                                    left: `${bucket.left}%`,
                                    width: `${bucket.width}%`,
                                    height: `${bucket.height}%`,
                                }}
                            />
                        ))}
                    </div>

                    {ticks.map((tick) => (
                        <div key={`tick-${tick}`} className="lv-track__tick" style={{ left: `${tick}%` }} />
                    ))}

                    {currentMatchTimestamp === null ? null : (
                        <div
                            className="lv-track__current"
                            style={{ left: `${percentOf(currentMatchTimestamp, span)}%` }}
                        />
                    )}

                    {box ? (
                        <div
                            className="lv-track__viewport"
                            style={{ left: `${box.left}%`, width: `${box.width}%` }}
                        />
                    ) : null}

                    {range ? (
                        <>
                            {rangeActive ? (
                                <>
                                    <div
                                        className="lv-track__outside"
                                        style={{ left: 0, width: `${percentOf(range.from, span)}%` }}
                                    />
                                    <div
                                        className="lv-track__outside"
                                        style={{ left: `${percentOf(range.to, span)}%`, right: 0 }}
                                    />
                                </>
                            ) : null}
                            <button
                                type="button"
                                className="lv-track__handle"
                                data-active={rangeActive}
                                data-edge="from"
                                style={{ left: `${percentOf(range.from, span)}%` }}
                                title={`Poczatek zakresu: ${formatClock(range.from)}`}
                                onPointerDown={onHandlePointerDown("from")}
                            />
                            <button
                                type="button"
                                className="lv-track__handle"
                                data-active={rangeActive}
                                data-edge="to"
                                style={{ left: `${percentOf(range.to, span)}%` }}
                                title={`Koniec zakresu: ${formatClock(range.to)}`}
                                onPointerDown={onHandlePointerDown("to")}
                            />
                        </>
                    ) : null}

                    <div className="lv-track__events">
                        {events.map((line) => {
                            const meta = LOG_EVENT_META[line.event!];
                            const left = percentOf(line.timestamp, span);
                            const flip = left > NAME_FLIP_AT;
                            return (
                                <Fragment key={`event-${line.number}`}>
                                    <button
                                        type="button"
                                        className="lv-track__event"
                                        style={{ left: `${left}%`, color: meta.colorToken }}
                                        title={`${meta.label}${line.character ? `: ${line.character}` : ""} o ${formatClock(line.timestamp)}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onJumpToTime(line.timestamp, "center");
                                        }}
                                    >
                                        {meta.glyph}
                                    </button>
                                    {named.has(line.number) ? (
                                        <span
                                            className="lv-track__event-name"
                                            style={{
                                                left: `${left}%`,
                                                transform: flip ? "translateX(-100%)" : "none",
                                                marginLeft: flip ? "-10px" : "10px",
                                            }}
                                        >
                                            {line.character}
                                        </span>
                                    ) : null}
                                </Fragment>
                            );
                        })}
                    </div>

                    {hover === null || hoverTimestamp === null ? null : (
                        <>
                            <div className="lv-track__hairline" style={{ left: `${hover * 100}%` }} />
                            <div
                                className="lv-track__hover"
                                style={{
                                    left: `${hover * 100}%`,
                                    marginLeft: hover > TOOLTIP_FLIP_AT ? "-160px" : "8px",
                                }}
                            >
                                {formatClock(hoverTimestamp)} {"·"}{" "}
                                {(() => {
                                    const near = countNear(activityLines, hoverTimestamp, span);
                                    return `${near} ${pluralLines(near)}`;
                                })()}
                            </div>
                        </>
                    )}
                </div>

                <IconButton title="Skocz na koniec  End" onClick={onJumpToEnd}>
                    <Icon name="jump-end" />
                </IconButton>
            </div>

            <div className="lv-timeline__axis">
                {axis.map((tick) => (
                    <span
                        key={`axis-${tick.left}`}
                        style={{
                            left: `${tick.left}%`,
                            transform:
                                tick.align === "start"
                                    ? "none"
                                    : tick.align === "end"
                                      ? "translateX(-100%)"
                                      : "translateX(-50%)",
                        }}
                    >
                        {formatAxisLabel(tick.timestamp, span.duration)}
                    </span>
                ))}
            </div>
        </div>
    );
}

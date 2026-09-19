import { useCallback, useRef, useState } from "react";
import { Icon, IconButton } from "@design";
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
import type { LogLine } from "../model/types";

export interface TimelineProps {
    /** Every line in the session — idle gaps and the span come from these. */
    allLines: LogLine[];
    /** The lines currently shown — the histogram and ticks come from these. */
    visibleLines: LogLine[];
    live: boolean;
    matchTimestamps: number[];
    currentMatchTimestamp: number | null;
    /** Time range of the rows on screen, or null before the first measure. */
    viewport: { from: number; to: number } | null;
    onJumpToTime: (timestamp: number, align: "start" | "center") => void;
    onJumpToStart: () => void;
    onJumpToEnd: () => void;
}

/** Past this point a hover tooltip would run off the right edge, so it flips. */
const TOOLTIP_FLIP_AT = 0.78;

export function Timeline({
    allLines,
    visibleLines,
    live,
    matchTimestamps,
    currentMatchTimestamp,
    viewport,
    onJumpToTime,
    onJumpToStart,
    onJumpToEnd,
}: TimelineProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [hover, setHover] = useState<number | null>(null);

    const span = spanOf(allLines, live);
    const buckets = buildHistogram(visibleLines, span);
    const gaps = findIdleGaps(allLines, span);
    const ticks = buildMatchTicks(matchTimestamps, span);
    const axis = buildAxisTicks(span);
    const events = allLines.filter((line) => line.event);
    const box = viewport ? viewportBox(viewport.from, viewport.to, span) : null;

    const fractionFromEvent = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    }, []);

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
                <div className="ark-spacer" />
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
                    title="Kliknij, aby przejsc do tego momentu"
                    onMouseMove={(event) => {
                        const fraction = fractionFromEvent(event);
                        setHover((previous) =>
                            previous === null || Math.abs(previous - fraction) > 0.003 ? fraction : previous,
                        );
                    }}
                    onMouseLeave={() => setHover(null)}
                    onClick={(event) => {
                        const fraction = fractionFromEvent(event);
                        onJumpToTime(span.from + span.duration * fraction, "start");
                    }}
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

                    <div className="lv-track__events">
                        {events.map((line) => {
                            const meta = LOG_EVENT_META[line.event!];
                            return (
                                <button
                                    key={`event-${line.number}`}
                                    type="button"
                                    className="lv-track__event"
                                    style={{ left: `${percentOf(line.timestamp, span)}%`, color: meta.colorToken }}
                                    title={`${meta.label} o ${formatClock(line.timestamp)}`}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onJumpToTime(line.timestamp, "center");
                                    }}
                                >
                                    {meta.glyph}
                                </button>
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
                                    const near = countNear(visibleLines, hoverTimestamp, span);
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

import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { type FlatLogLine, formatTime } from "./logBrowserUtils";

export interface TimeRange {
  from: number;
  to: number;
}

interface LogTimelineProps {
  lines: FlatLogLine[];
  value: TimeRange | null;
  onChange: (value: TimeRange | null) => void;
  /** Time span currently scrolled into view in the preview, drawn as a marker. */
  viewport?: TimeRange | null;
  /** A click (no drag) on the track asks the preview to jump to that time. */
  onSeek?: (timestamp: number) => void;
}

const BIN_COUNT = 80;
/** Pointer travel (px) that turns a click on the track into a range drag. */
const DRAG_THRESHOLD = 4;

type Drag =
  | { kind: "from" | "to" }
  | { kind: "select"; anchorX: number; anchorTs: number; moved: boolean };

const formatClock = (ts: number) => formatTime(ts).slice(0, 8);

/**
 * Activity histogram for narrowing a session's visible (and downloaded) time
 * window. Dragging across the track selects a range, the start/end handles fine
 * tune it, and a plain click jumps the preview to that moment. `lines` are
 * assumed chronologically ordered, so a [from, to] window maps to a contiguous
 * slice. The pointer is captured by the track, so a drag keeps tracking outside
 * it and always ends (pointerup or pointercancel).
 */
export function LogTimeline({ lines, value, onChange, viewport, onSeek }: LogTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const { min, max, bins, maxCount } = useMemo(() => {
    if (lines.length === 0) {
      return { min: 0, max: 0, bins: [] as number[], maxCount: 0 };
    }
    const lo = lines[0].timestamp;
    const hi = lines[lines.length - 1].timestamp;
    const span = Math.max(1, hi - lo);
    const counts = new Array<number>(BIN_COUNT).fill(0);
    for (const line of lines) {
      let idx = Math.floor(((line.timestamp - lo) / span) * BIN_COUNT);
      if (idx >= BIN_COUNT) idx = BIN_COUNT - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    }
    return { min: lo, max: hi, bins: counts, maxCount: counts.reduce((m, c) => Math.max(m, c), 0) };
  }, [lines]);

  if (lines.length === 0 || max === min) return null;

  const span = max - min;
  const from = value?.from ?? min;
  const to = value?.to ?? max;
  const isFiltered = value !== null && (from > min || to < max);
  const pct = (ts: number) => Math.min(100, Math.max(0, ((ts - min) / span) * 100));

  const tsFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return min;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(min + ratio * span);
  };

  const emit = (nextFrom: number, nextTo: number) => {
    // Collapse back to "no filter" once the window covers the whole session.
    if (nextFrom <= min && nextTo >= max) onChange(null);
    else onChange({ from: nextFrom, to: nextTo });
  };

  const startDrag = (e: ReactPointerEvent, drag: Drag) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    trackRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = drag;
  };

  const onTrackPointerDown = (e: ReactPointerEvent) =>
    startDrag(e, { kind: "select", anchorX: e.clientX, anchorTs: tsFromClientX(e.clientX), moved: false });

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const ts = tsFromClientX(e.clientX);
    if (drag.kind === "from") emit(Math.min(ts, to), to);
    else if (drag.kind === "to") emit(from, Math.max(ts, from));
    else if (drag.kind === "select") {
      if (!drag.moved && Math.abs(e.clientX - drag.anchorX) < DRAG_THRESHOLD) return;
      drag.moved = true;
      emit(Math.min(drag.anchorTs, ts), Math.max(drag.anchorTs, ts));
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind === "select" && !drag.moved) onSeek?.(drag.anchorTs);
    trackRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const onPointerCancel = () => { dragRef.current = null; };

  return (
    <div className="logs-timeline">
      <div className="logs-timeline-header">
        <span className="logs-timeline-bound">{formatClock(min)}</span>
        <span className="logs-timeline-range">
          {isFiltered ? `${formatClock(from)} – ${formatClock(to)}` : "Caly log"}
          {isFiltered && (
            <button type="button" className="logs-timeline-reset" onClick={() => onChange(null)}>
              Wyczysc
            </button>
          )}
        </span>
        <span className="logs-timeline-bound">{formatClock(max)}</span>
      </div>
      <div
        className="logs-timeline-track"
        ref={trackRef}
        title="Kliknij, aby przejsc do tej chwili. Przeciagnij, aby zaznaczyc zakres."
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
      >
        <div className="logs-timeline-hist">
          {bins.map((count, i) => {
            const binStart = min + (span * i) / BIN_COUNT;
            const binEnd = min + (span * (i + 1)) / BIN_COUNT;
            const inRange = binEnd >= from && binStart <= to;
            return (
              <div
                key={i}
                className={`logs-timeline-bar${inRange ? "" : " logs-timeline-bar-dim"}`}
                style={{ height: `${maxCount ? Math.max(3, (count / maxCount) * 100) : 0}%` }}
              />
            );
          })}
        </div>
        {isFiltered && (
          <div
            className="logs-timeline-selection"
            style={{ left: `${pct(from)}%`, right: `${100 - pct(to)}%` }}
          />
        )}
        {viewport && (
          <div
            className="logs-timeline-viewport"
            style={{ left: `${pct(viewport.from)}%`, width: `${Math.max(0, pct(viewport.to) - pct(viewport.from))}%` }}
          />
        )}
        <div
          className="logs-timeline-handle"
          style={{ left: `${pct(from)}%` }}
          title="Poczatek zakresu"
          onPointerDown={(e) => startDrag(e, { kind: "from" })}
        />
        <div
          className="logs-timeline-handle"
          style={{ left: `${pct(to)}%` }}
          title="Koniec zakresu"
          onPointerDown={(e) => startDrag(e, { kind: "to" })}
        />
      </div>
    </div>
  );
}

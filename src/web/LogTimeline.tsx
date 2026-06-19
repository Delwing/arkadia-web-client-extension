import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { type FlatLogLine, formatTime } from "./logBrowserUtils";

export interface TimeRange {
  from: number;
  to: number;
}

interface LogTimelineProps {
  lines: FlatLogLine[];
  value: TimeRange | null;
  onChange: (value: TimeRange | null) => void;
}

const BIN_COUNT = 80;

/**
 * Activity histogram with two draggable start/end handle lines for narrowing a
 * session's visible (and downloaded) time window. `lines` are assumed
 * chronologically ordered, so the selected [from, to] window maps to a
 * contiguous slice. Dragging is handled with pointer events (no native range
 * inputs) so nothing opaque is layered over the histogram bars.
 */
export function LogTimeline({ lines, value, onChange }: LogTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<null | "from" | "to">(null);

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

  const span = max - min;
  const from = value?.from ?? min;
  const to = value?.to ?? max;

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

  const moveHandle = (which: "from" | "to", ts: number) => {
    if (which === "from") emit(Math.min(ts, to), to);
    else emit(from, Math.max(ts, from));
  };

  // Global pointer listeners stay active only while a handle is being dragged.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      moveHandle(draggingRef.current, tsFromClientX(e.clientX));
    };
    const onUp = () => { draggingRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  });

  if (lines.length === 0 || max === min) return null;

  const isFiltered = value !== null && (from > min || to < max);
  const pct = (ts: number) => ((ts - min) / span) * 100;

  // Clicking the histogram grabs and moves whichever handle is nearer.
  const onTrackPointerDown = (e: ReactPointerEvent) => {
    const ts = tsFromClientX(e.clientX);
    const which = Math.abs(ts - from) <= Math.abs(ts - to) ? "from" : "to";
    draggingRef.current = which;
    moveHandle(which, ts);
  };

  const onHandlePointerDown = (which: "from" | "to") => (e: ReactPointerEvent) => {
    e.stopPropagation();
    draggingRef.current = which;
  };

  return (
    <div className="logs-timeline">
      <div className="logs-timeline-header">
        <span className="logs-timeline-bound">{formatTime(min)}</span>
        <span className="logs-timeline-range">
          {isFiltered ? `${formatTime(from)} – ${formatTime(to)}` : "Caly log"}
          {isFiltered && (
            <button type="button" className="logs-timeline-reset" onClick={() => onChange(null)}>
              Wyczysc
            </button>
          )}
        </span>
        <span className="logs-timeline-bound">{formatTime(max)}</span>
      </div>
      <div className="logs-timeline-track" ref={trackRef} onPointerDown={onTrackPointerDown}>
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
        <div
          className="logs-timeline-selection"
          style={{ left: `${pct(from)}%`, right: `${100 - pct(to)}%` }}
        />
        <div
          className="logs-timeline-handle"
          style={{ left: `${pct(from)}%` }}
          onPointerDown={onHandlePointerDown("from")}
        />
        <div
          className="logs-timeline-handle"
          style={{ left: `${pct(to)}%` }}
          onPointerDown={onHandlePointerDown("to")}
        />
      </div>
    </div>
  );
}

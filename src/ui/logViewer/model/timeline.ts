/**
 * Timeline geometry.
 *
 * The x axis is TIME, not line index — that is the whole point of the
 * component. Half an hour of standing still has to look like half an hour of
 * nothing, or the timeline lies about where a moment sits in the session.
 */
/** Everything here needs one field only; taking the narrow shape lets the
 *  viewer pass rendered rows without rebuilding them as lines. */
export interface TimePoint {
    timestamp: number;
}

/** Histogram resolution. 96 buckets is roughly one per 12px at full width. */
export const BUCKET_COUNT = 96;

/** A pause longer than this reads as "away", not as slow play. */
export const IDLE_GAP_MS = 240_000;

export interface TimelineSpan {
    from: number;
    to: number;
    /** Never zero, so a single-line session still divides safely. */
    duration: number;
}

export function spanOf(lines: TimePoint[], live: boolean, now: number = Date.now()): TimelineSpan {
    if (lines.length === 0) return { from: now, to: now, duration: 1 };
    const from = lines[0].timestamp;
    const to = live ? Math.max(now, lines[lines.length - 1].timestamp) : lines[lines.length - 1].timestamp;
    return { from, to, duration: Math.max(1, to - from) };
}

/** Position of a moment along the track, clamped to 0–100. */
export function percentOf(timestamp: number, span: TimelineSpan): number {
    return Math.max(0, Math.min(100, ((timestamp - span.from) / span.duration) * 100));
}

export interface Bucket {
    left: number;
    width: number;
    /** Bar height as a percentage of the tallest bucket. */
    height: number;
    count: number;
}

/** Bars narrower than this are invisible; a non-empty bucket must still show. */
const MIN_BAR_HEIGHT = 8;
const BAR_WIDTH_RATIO = 0.72;

/**
 * Activity histogram over the VISIBLE lines — the bars have to answer "where is
 * there something to read", which channel filters change.
 */
export function buildHistogram(lines: TimePoint[], span: TimelineSpan, bucketCount = BUCKET_COUNT): Bucket[] {
    const counts = new Array<number>(bucketCount).fill(0);
    for (const line of lines) {
        const ratio = (line.timestamp - span.from) / span.duration;
        const index = Math.max(0, Math.min(bucketCount - 1, Math.floor(ratio * bucketCount)));
        counts[index] += 1;
    }
    const max = Math.max(1, ...counts);
    const bucketWidth = 100 / bucketCount;

    const buckets: Bucket[] = [];
    counts.forEach((count, index) => {
        if (count === 0) return;
        buckets.push({
            left: index * bucketWidth,
            width: bucketWidth * BAR_WIDTH_RATIO,
            height: Math.max(MIN_BAR_HEIGHT, (count / max) * 100),
            count,
        });
    });
    return buckets;
}

export interface IdleGap {
    left: number;
    width: number;
    durationMs: number;
}

/**
 * Idle bands come from ALL lines, not the filtered ones: a gap that only exists
 * because a channel is hidden is not a gap in the session.
 */
export function findIdleGaps(lines: TimePoint[], span: TimelineSpan, threshold = IDLE_GAP_MS): IdleGap[] {
    const gaps: IdleGap[] = [];
    for (let i = 1; i < lines.length; i += 1) {
        const delta = lines[i].timestamp - lines[i - 1].timestamp;
        if (delta <= threshold) continue;
        const left = percentOf(lines[i - 1].timestamp, span);
        gaps.push({ left, width: percentOf(lines[i].timestamp, span) - left, durationMs: delta });
    }
    return gaps;
}

/**
 * Match ticks, de-duplicated: below about a third of a percent apart two ticks
 * land on the same pixel and only cost drawing time.
 */
export function buildMatchTicks(timestamps: number[], span: TimelineSpan): number[] {
    const seen = new Set<number>();
    const ticks: number[] = [];
    for (const timestamp of timestamps) {
        const percent = percentOf(timestamp, span);
        const key = Math.round(percent * 3);
        if (seen.has(key)) continue;
        seen.add(key);
        ticks.push(percent);
    }
    return ticks;
}

export interface AxisTick {
    left: number;
    timestamp: number;
    /** Keeps the first and last labels inside the track. */
    align: "start" | "center" | "end";
}

export function buildAxisTicks(span: TimelineSpan, count = 6): AxisTick[] {
    const steps = Math.max(2, count) - 1;
    return Array.from({ length: steps + 1 }, (_unused, index) => ({
        left: (index / steps) * 100,
        timestamp: span.from + (span.duration * index) / steps,
        align: index === 0 ? "start" : index === steps ? "end" : "center",
    }));
}

/**
 * The viewport box. Given a min width so a short view is still visible, and
 * pulled back inside the track when that widening would push it off the end.
 */
export function viewportBox(
    fromTimestamp: number,
    toTimestamp: number,
    span: TimelineSpan,
    minWidth = 0.6,
): { left: number; width: number } {
    const left = percentOf(fromTimestamp, span);
    const width = Math.max(minWidth, percentOf(toTimestamp, span) - left);
    return { left: Math.min(left, 100 - width), width };
}

/** Lines within half a bucket of the hovered moment — the hover tooltip's count. */
export function countNear(lines: TimePoint[], timestamp: number, span: TimelineSpan, bucketCount = BUCKET_COUNT): number {
    const half = span.duration / bucketCount / 2;
    let count = 0;
    for (const line of lines) {
        if (Math.abs(line.timestamp - timestamp) <= half) count += 1;
    }
    return count;
}

/** Index of the first line at or after a moment; the last line when none is. */
export function indexAtOrAfter(lines: TimePoint[], timestamp: number): number {
    let low = 0;
    let high = lines.length - 1;
    let found = lines.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (lines[mid].timestamp >= timestamp) {
            found = mid;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    return Math.max(0, found);
}

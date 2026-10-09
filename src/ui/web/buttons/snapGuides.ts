/**
 * Alignment guides for dragging desktop buttons: the dragged box gently snaps
 * its left/center/right (and top/middle/bottom) onto the same lines of the
 * other buttons when within `SNAP_THRESHOLD` px, and next to a neighbouring
 * button it snaps to sit `SNAP_GAP` px away from it. Reports the guide lines
 * to draw. Pure geometry — the component owns the DOM.
 */

export const SNAP_THRESHOLD = 6;
export const SNAP_GAP = 4;

export type Box = { x: number; y: number; width: number; height: number };

/** A guide line: vertical (`axis: 'x'`) at `pos`, spanning `from`..`to` on y — or the transpose. */
export type Guide = { axis: 'x' | 'y'; pos: number; from: number; to: number };

export type SnapResult = { x: number; y: number; guides: Guide[] };

/** A box projected on one axis: `start`/`size` along it, `cross*` across it. */
type Span = { start: number; size: number; crossStart: number; crossSize: number };

const span = (b: Box, axis: 'x' | 'y'): Span =>
    axis === 'x'
        ? { start: b.x, size: b.width, crossStart: b.y, crossSize: b.height }
        : { start: b.y, size: b.height, crossStart: b.x, crossSize: b.width };

const lines = (s: Span) => [s.start, s.start + s.size / 2, s.start + s.size];

const overlapsAcross = (a: Span, b: Span) =>
    a.crossStart < b.crossStart + b.crossSize && b.crossStart < a.crossStart + a.crossSize;

/**
 * One snap candidate: moving the box by `offset` puts it on a line it shares
 * with `other` — the same line for alignment, or `SNAP_GAP` apart for spacing.
 * `guideAt(start)` is where the guide goes once the box starts at `start`.
 */
type Candidate = { offset: number; other: Span; guideAt: (start: number) => number };

function candidates(moving: Span, others: Span[]): Candidate[] {
    const out: Candidate[] = [];
    const own = lines(moving);
    const ownOffset = (i: number) => own[i] - moving.start;
    for (const other of others) {
        const neighbour = overlapsAcross(moving, other);
        const targets = lines(other);
        own.forEach((o, i) => {
            targets.forEach((t, j) => {
                // Next to a neighbour, touching edges give way to the gap below.
                if (neighbour && ((i === 0 && j === 2) || (i === 2 && j === 0))) return;
                out.push({ offset: t - o, other, guideAt: (start) => start + ownOffset(i) });
            });
        });
        if (neighbour) {
            // Our start a gap after its end, or our end a gap before its start;
            // the guide marks the middle of the gap.
            const after = other.start + other.size + SNAP_GAP;
            out.push({ offset: after - moving.start, other, guideAt: (start) => start - SNAP_GAP / 2 });
            const before = other.start - SNAP_GAP;
            out.push({ offset: before - (moving.start + moving.size), other, guideAt: (start) => start + moving.size + SNAP_GAP / 2 });
        }
    }
    return out;
}

function snapAxis(moving: Box, others: Box[], axis: 'x' | 'y', threshold: number): { start: number; guides: Guide[] } {
    const m = span(moving, axis);
    const all = candidates(m, others.map((o) => span(o, axis)));
    let best: number | null = null;
    for (const c of all) {
        if (Math.abs(c.offset) <= threshold && (best === null || Math.abs(c.offset) < Math.abs(best))) best = c.offset;
    }
    if (best === null) return { start: m.start, guides: [] };

    const start = m.start + best;
    // Every candidate the snapped position satisfies draws a guide, so
    // coincident lines (e.g. same-height buttons) all show up; same-position
    // guides merge into one spanning all their boxes.
    const byPos = new Map<number, Span[]>();
    for (const c of all) {
        if (Math.abs(c.offset - best) >= 0.5) continue;
        const pos = c.guideAt(start);
        byPos.set(pos, [...(byPos.get(pos) ?? []), c.other]);
    }
    const guides: Guide[] = [];
    byPos.forEach((matched, pos) => {
        const spans = [...matched, m];
        guides.push({
            axis,
            pos,
            from: Math.min(...spans.map((s) => s.crossStart)),
            to: Math.max(...spans.map((s) => s.crossStart + s.crossSize)),
        });
    });
    return { start, guides };
}

export function snapBox(moving: Box, others: Box[], threshold = SNAP_THRESHOLD): SnapResult {
    // Which buttons count as neighbours depends on the other axis, so x is
    // settled again once y has snapped.
    const firstX = snapAxis(moving, others, 'x', threshold);
    const sy = snapAxis({ ...moving, x: firstX.start }, others, 'y', threshold);
    const sx = snapAxis({ ...moving, y: sy.start }, others, 'x', threshold);
    return { x: sx.start, y: sy.start, guides: [...sx.guides, ...sy.guides] };
}

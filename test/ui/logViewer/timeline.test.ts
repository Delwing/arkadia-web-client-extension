import { describe, expect, it } from "vitest";
import {
    BUCKET_COUNT,
    buildAxisTicks,
    buildHistogram,
    buildMatchTicks,
    countNear,
    findIdleGaps,
    indexAtOrAfter,
    percentOf,
    spanOf,
    viewportBox,
} from "@ui/logViewer/model/timeline";

const T0 = 1_700_000_000_000;
const lineAt = (offsetSeconds: number) => ({ timestamp: T0 + offsetSeconds * 1000 });

describe("spanOf", () => {
    it("spans first to last line", () => {
        const span = spanOf([lineAt(0), lineAt(600)], false);
        expect(span.from).toBe(T0);
        expect(span.to).toBe(T0 + 600_000);
        expect(span.duration).toBe(600_000);
    });

    it("runs a live session up to now, so the track keeps growing", () => {
        const now = T0 + 900_000;
        const span = spanOf([lineAt(0), lineAt(600)], true, now);
        expect(span.to).toBe(now);
    });

    it("never divides by zero on a one-line session", () => {
        expect(spanOf([lineAt(0)], false).duration).toBe(1);
        expect(spanOf([], false, T0).duration).toBe(1);
    });
});

describe("percentOf", () => {
    it("is proportional to time, not to line index", () => {
        const span = spanOf([lineAt(0), lineAt(100)], false);
        expect(percentOf(T0 + 25_000, span)).toBeCloseTo(25);
        expect(percentOf(T0 + 75_000, span)).toBeCloseTo(75);
    });

    it("clamps outside the span", () => {
        const span = spanOf([lineAt(0), lineAt(100)], false);
        expect(percentOf(T0 - 50_000, span)).toBe(0);
        expect(percentOf(T0 + 500_000, span)).toBe(100);
    });
});

describe("buildHistogram", () => {
    it("leaves quiet stretches empty", () => {
        // Everything happens in the first tenth of the session.
        const lines = [...Array(20)].map((_unused, index) => lineAt(index));
        lines.push(lineAt(1000));
        const span = spanOf(lines, false);
        const buckets = buildHistogram(lines, span);
        expect(buckets.length).toBeLessThan(BUCKET_COUNT);
        expect(buckets.every((bucket) => bucket.count > 0)).toBe(true);
    });

    it("keeps a single-line bucket visible", () => {
        const lines = [...Array(50)].map(() => lineAt(0));
        lines.push(lineAt(500));
        const buckets = buildHistogram(lines, spanOf(lines, false));
        const smallest = buckets.reduce((low, bucket) => Math.min(low, bucket.height), 100);
        expect(smallest).toBeGreaterThanOrEqual(8);
    });

    it("scales the tallest bar to full height", () => {
        const lines = [lineAt(0), lineAt(0), lineAt(100)];
        const buckets = buildHistogram(lines, spanOf(lines, false));
        expect(Math.max(...buckets.map((bucket) => bucket.height))).toBe(100);
    });
});

describe("findIdleGaps", () => {
    it("bands only pauses past the threshold", () => {
        const lines = [lineAt(0), lineAt(60), lineAt(60 + 600), lineAt(60 + 610)];
        const gaps = findIdleGaps(lines, spanOf(lines, false));
        expect(gaps).toHaveLength(1);
        expect(gaps[0].durationMs).toBe(600_000);
    });

    it("finds nothing in steady activity", () => {
        const lines = [...Array(10)].map((_unused, index) => lineAt(index * 10));
        expect(findIdleGaps(lines, spanOf(lines, false))).toEqual([]);
    });
});

describe("buildMatchTicks", () => {
    it("drops ticks that would land on the same pixel", () => {
        const lines = [lineAt(0), lineAt(3600)];
        const span = spanOf(lines, false);
        const clustered = [T0 + 1000, T0 + 1001, T0 + 1002];
        expect(buildMatchTicks(clustered, span)).toHaveLength(1);
    });

    it("keeps ticks that are visibly apart", () => {
        const lines = [lineAt(0), lineAt(100)];
        const span = spanOf(lines, false);
        expect(buildMatchTicks([T0, T0 + 50_000, T0 + 100_000], span)).toHaveLength(3);
    });
});

describe("buildAxisTicks", () => {
    it("spreads labels evenly and pins the ends inside the track", () => {
        const ticks = buildAxisTicks(spanOf([lineAt(0), lineAt(600)], false));
        expect(ticks).toHaveLength(6);
        expect(ticks[0]).toMatchObject({ left: 0, align: "start" });
        expect(ticks[5]).toMatchObject({ left: 100, align: "end" });
        expect(ticks[2].align).toBe("center");
    });
});

describe("viewportBox", () => {
    it("spans the visible time range", () => {
        const span = spanOf([lineAt(0), lineAt(100)], false);
        const box = viewportBox(T0 + 20_000, T0 + 40_000, span);
        expect(box.left).toBeCloseTo(20);
        expect(box.width).toBeCloseTo(20);
    });

    it("stays inside the track when widened at the far end", () => {
        const span = spanOf([lineAt(0), lineAt(100)], false);
        const box = viewportBox(T0 + 100_000, T0 + 100_000, span);
        expect(box.left + box.width).toBeLessThanOrEqual(100);
        expect(box.width).toBeGreaterThan(0);
    });
});

describe("countNear", () => {
    it("counts lines within half a bucket of the hovered moment", () => {
        const lines = [lineAt(0), lineAt(1), lineAt(2), lineAt(600)];
        const span = spanOf(lines, false);
        expect(countNear(lines, T0, span)).toBeGreaterThanOrEqual(1);
        expect(countNear(lines, T0 + 300_000, span)).toBe(0);
    });
});

describe("indexAtOrAfter", () => {
    const lines = [lineAt(0), lineAt(10), lineAt(20), lineAt(30)];

    it("finds the first line at or after a moment", () => {
        expect(indexAtOrAfter(lines, T0 + 10_000)).toBe(1);
        expect(indexAtOrAfter(lines, T0 + 15_000)).toBe(2);
    });

    it("clamps to the ends", () => {
        expect(indexAtOrAfter(lines, T0 - 1000)).toBe(0);
        expect(indexAtOrAfter(lines, T0 + 999_000)).toBe(3);
    });
});

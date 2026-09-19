import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { LogPane } from "@ui/logViewer/components/LogPane";
import type { RenderedRow } from "@ui/logViewer/model/viewerState";

/**
 * Regression cover for a bug that no pure test could have caught: the pane's
 * scroll height was memoised on the virtualizer instance, which keeps the same
 * identity for the life of the component. The height therefore froze at
 * whatever the FIRST render measured, so any later change to the row count — a
 * selected range, a channel filter, "matching lines only" — left the pane with
 * a stale scroll height, and a shrinking list rendered blank because the scroll
 * position was past the end of the real content.
 */
const T0 = new Date(2026, 8, 19, 20, 0, 0).getTime();
const LINE_HEIGHT = 21;

function makeRows(count: number): RenderedRow[] {
    return Array.from({ length: count }, (_unused, index) => ({
        lineIndex: index,
        number: index + 1,
        timestamp: T0 + index * 1000,
        channel: "combat" as const,
        text: `linia ${index + 1}`,
        segments: [{ text: `linia ${index + 1}`, match: false }],
        matchCount: 0,
    }));
}

describe("LogPane scroll height", () => {
    let container: HTMLElement;
    let root: Root;

    const render = (rows: RenderedRow[]) =>
        act(() => {
            root.render(
                <LogPane
                    rows={rows}
                    showTimestamps
                    showMeta
                    showColors={false}
                    wrap={false}
                    lineHeight={LINE_HEIGHT}
                    currentRow={null}
                    currentOccurrence={-1}
                    emptyMessage={null}
                    onResetFilters={() => undefined}
                    onViewportChange={() => undefined}
                    onScrollAwayFromBottom={() => undefined}
                    follow={false}
                    scrollRequest={null}
                    onLineContextMenu={() => undefined}
                />,
            );
        });

    const sizer = () => container.querySelector(".lv-log")?.firstElementChild as HTMLElement | null;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("sizes the scroll area to the row count", () => {
        render(makeRows(100));
        expect(sizer()?.style.minHeight).toBe(`${100 * LINE_HEIGHT}px`);
    });

    it("shrinks when the row count drops — the range/filter case", () => {
        render(makeRows(100));
        render(makeRows(12));
        expect(sizer()?.style.minHeight).toBe(`${12 * LINE_HEIGHT}px`);
    });

    it("grows again when the rows come back", () => {
        render(makeRows(12));
        render(makeRows(80));
        expect(sizer()?.style.minHeight).toBe(`${80 * LINE_HEIGHT}px`);
    });

    it("follows a change of density", () => {
        render(makeRows(10));
        act(() => {
            root.render(
                <LogPane
                    rows={makeRows(10)}
                    showTimestamps
                    showMeta
                    showColors={false}
                    wrap={false}
                    lineHeight={26}
                    currentRow={null}
                    currentOccurrence={-1}
                    emptyMessage={null}
                    onResetFilters={() => undefined}
                    onViewportChange={() => undefined}
                    onScrollAwayFromBottom={() => undefined}
                    follow={false}
                    scrollRequest={null}
                    onLineContextMenu={() => undefined}
                />,
            );
        });
        expect(sizer()?.style.minHeight).toBe(`${10 * 26}px`);
    });

    it("collapses to nothing when every row is filtered out", () => {
        render(makeRows(40));
        render([]);
        expect(sizer()?.style.minHeight).toBe("0px");
    });
});

describe("LogPane columns", () => {
    let container: HTMLElement;
    let root: Root;
    beforeEach(() => {
        // jsdom lays nothing out, so the virtualizer measures a zero-height
        // scroll element and renders no rows at all. It sizes the viewport from
        // `offsetWidth`/`offsetHeight` (not `getBoundingClientRect`), so those
        // are what have to be faked.
        for (const property of ["offsetWidth", "offsetHeight"] as const) {
            Object.defineProperty(HTMLElement.prototype, property, {
                configurable: true,
                get: () => (property === "offsetWidth" ? 900 : 600),
            });
        }

        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        for (const property of ["offsetWidth", "offsetHeight"] as const) {
            Reflect.deleteProperty(HTMLElement.prototype, property);
        }
    });

    const renderWith = (showTimestamps: boolean, showMeta: boolean) =>
        act(() => {
            root.render(
                <LogPane
                    rows={makeRows(3)}
                    showTimestamps={showTimestamps}
                    showMeta={showMeta}
                    showColors={false}
                    wrap={false}
                    lineHeight={LINE_HEIGHT}
                    currentRow={null}
                    currentOccurrence={-1}
                    emptyMessage={null}
                    onResetFilters={() => undefined}
                    onViewportChange={() => undefined}
                    onScrollAwayFromBottom={() => undefined}
                    follow={false}
                    scrollRequest={null}
                    onLineContextMenu={() => undefined}
                />,
            );
        });

    /**
     * The grid tracks are chosen in CSS from these two data attributes, so the
     * cell count the row renders has to match them — a mismatch silently
     * collapses the text column, which is exactly how it broke once before.
     */
    it("renders one cell per declared column", () => {
        const cells = () => container.querySelector(".lv-log__row")?.children.length;

        renderWith(true, true);
        expect(container.querySelector(".lv-log")?.getAttribute("data-meta")).toBe("true");
        expect(cells()).toBe(4);

        renderWith(false, true);
        expect(cells()).toBe(3);

        renderWith(true, false);
        expect(cells()).toBe(2);

        renderWith(false, false);
        expect(cells()).toBe(1);
    });
});

describe("LogPane reported viewport", () => {
    let container: HTMLElement;
    let root: Root;
    const PANE_HEIGHT = 600;

    beforeEach(() => {
        // The virtualizer sizes its viewport from offsetHeight; the viewport
        // report measures with rects and clientHeight. jsdom lays nothing out,
        // so all three need faking.
        for (const [property, value] of [
            ["offsetWidth", 900],
            ["offsetHeight", PANE_HEIGHT],
            ["clientHeight", PANE_HEIGHT],
        ] as const) {
            Object.defineProperty(HTMLElement.prototype, property, {
                configurable: true,
                get: () => value,
            });
        }

        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        for (const property of ["offsetWidth", "offsetHeight", "clientHeight"] as const) {
            Reflect.deleteProperty(HTMLElement.prototype, property);
        }
    });

    /**
     * `getVirtualItems()` returns the rendered window, which includes the
     * overscan buffer — roughly twice the viewport again. Reporting its first
     * and last item made the timeline's "Widok" box about three times too wide,
     * which was glaring once a channel filter left the visible rows spread
     * thinly across the session.
     */
    it("reports only the rows on screen, not the overscan buffer", () => {
        const rows = makeRows(400);
        let reported: { from: number; to: number } | null = null;

        act(() => {
            root.render(
                <LogPane
                    rows={rows}
                    showTimestamps
                    showMeta
                    showColors={false}
                    wrap={false}
                    lineHeight={LINE_HEIGHT}
                    currentRow={null}
                    currentOccurrence={-1}
                    emptyMessage={null}
                    onResetFilters={() => undefined}
                    onViewportChange={(range) => {
                        reported = range;
                    }}
                    onScrollAwayFromBottom={() => undefined}
                    follow={false}
                    scrollRequest={null}
                    onLineContextMenu={() => undefined}
                />,
            );
        });

        expect(reported).not.toBeNull();
        const range = reported as unknown as { from: number; to: number };
        const firstIndex = rows.findIndex((row) => row.timestamp === range.from);
        const lastIndex = rows.findIndex((row) => row.timestamp === range.to);

        expect(firstIndex).toBe(0);

        // A 600px pane at 21px a row holds about 29 of them. The rendered set
        // is far larger; the report must not follow it.
        const fits = Math.ceil(PANE_HEIGHT / LINE_HEIGHT);
        expect(lastIndex).toBeGreaterThanOrEqual(fits - 2);
        expect(lastIndex).toBeLessThanOrEqual(fits + 1);

        const rendered = container.querySelectorAll(".lv-log__row").length;
        expect(rendered).toBeGreaterThan(lastIndex + 10);
    });
});

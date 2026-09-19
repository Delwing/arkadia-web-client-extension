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

/**
 * Variable row heights: a wrapped line is as tall as the number of visual lines
 * it takes, so the height a row is laid out at no longer follows from one
 * constant. That moves the cache-invalidation problem that produced the
 * overlapping-rows bug: rows are now keyed by their line index (stable across
 * filters, which is what makes measured heights worth keeping), so a density
 * change no longer invalidates anything by itself and has to say so explicitly.
 */
describe("LogPane row height estimate", () => {
    let container: HTMLElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const sizer = () => container.querySelector(".lv-log")?.firstElementChild as HTMLElement | null;

    const renderRows = (rows: RenderedRow[], lineHeight: number) =>
        act(() => {
            root.render(
                <LogPane
                    rows={rows}
                    sessionKey="a"
                    showTimestamps
                    showMeta
                    showColors={false}
                    wrap={false}
                    lineHeight={lineHeight}
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

    it("follows a density change that the rows themselves do not signal", () => {
        // The same array is handed over twice on purpose. The virtualizer
        // memoises its measurements on the item KEYS and the measured-size
        // cache — not on the estimator — and a key made from the line index
        // does not move when only the density does. A fresh array would change
        // `getItemKey`'s identity and paper over exactly what this covers: the
        // offsets would go on stepping by the old height while the rows were
        // drawn at the new one, which is the overlap bug again.
        const rows = makeRows(10);
        renderRows(rows, LINE_HEIGHT);
        expect(sizer()?.style.minHeight).toBe(`${10 * LINE_HEIGHT}px`);

        renderRows(rows, 26);
        expect(sizer()?.style.minHeight).toBe(`${10 * 26}px`);
    });

    it("leaves the height fixed while wrapping is off — nothing can wrap", () => {
        const rows = makeRows(10).map((row) => ({ ...row, text: "x".repeat(4000) }));
        renderRows(rows, LINE_HEIGHT);
        expect(sizer()?.style.minHeight).toBe(`${10 * LINE_HEIGHT}px`);
    });
});

/**
 * The estimate itself. jsdom lays nothing out, so the measuring probe reads
 * zeros and the pane falls back to the fixed height — which is what every test
 * above relies on. Here the probe's rects are faked instead, so the pane
 * resolves a real column width and a real character width and can be asked
 * whether a long line is estimated as the several lines it will wrap to.
 */
describe("LogPane wrapped row height", () => {
    let container: HTMLElement;
    let root: Root;
    const PANE_WIDTH = 900;
    const TEXT_WIDTH = 800;
    const CHAR_WIDTH = 8;
    const ROW_HEIGHT = 21;
    const COLS = TEXT_WIDTH / CHAR_WIDTH;

    const rect = (width: number, height: number) =>
        ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;

    beforeEach(() => {
        Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
            configurable: true,
            value(this: HTMLElement) {
                if (this.classList.contains("lv-log__probe-text")) {
                    return rect(this.textContent!.length * CHAR_WIDTH, ROW_HEIGHT);
                }
                if (this.classList.contains("lv-log__probe")) return rect(PANE_WIDTH, ROW_HEIGHT);
                if (this.classList.contains("lv-log__text")) return rect(TEXT_WIDTH, ROW_HEIGHT);
                return rect(PANE_WIDTH, 600);
            },
        });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        Reflect.deleteProperty(HTMLElement.prototype, "getBoundingClientRect");
    });

    const sizer = () => container.querySelector(".lv-log")?.firstElementChild as HTMLElement | null;

    const renderWrapped = (rows: RenderedRow[], wrap: boolean) =>
        act(() => {
            root.render(
                <LogPane
                    rows={rows}
                    sessionKey="a"
                    showTimestamps
                    showMeta
                    showColors={false}
                    wrap={wrap}
                    lineHeight={ROW_HEIGHT}
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

    it("counts a long line as the rows it wraps to", () => {
        // Three visual lines' worth of text, in a log of ten such lines: with
        // one fixed height the scrollbar would claim the log is a third of its
        // real length, and a jump aimed past the viewport would land nowhere
        // near the line it named.
        const rows = makeRows(10).map((row) => ({ ...row, text: "x".repeat(COLS * 2 + 1) }));
        renderWrapped(rows, true);
        expect(sizer()?.style.minHeight).toBe(`${10 * 3 * ROW_HEIGHT}px`);
    });

    it("still gives a short line exactly one row", () => {
        renderWrapped(makeRows(10), true);
        expect(sizer()?.style.minHeight).toBe(`${10 * ROW_HEIGHT}px`);
    });

    it("ignores the text length once wrapping is off", () => {
        const rows = makeRows(10).map((row) => ({ ...row, text: "x".repeat(COLS * 5) }));
        renderWrapped(rows, false);
        expect(sizer()?.style.minHeight).toBe(`${10 * ROW_HEIGHT}px`);
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

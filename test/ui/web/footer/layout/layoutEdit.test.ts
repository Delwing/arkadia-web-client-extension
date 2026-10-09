import type { FooterLayout } from "@shared/footerLayoutTypes";
import {
  layoutWarnings,
  moveBandTo,
  moveNode,
  moveToNewBand,
  nodeAt,
  outline,
  pruneLayout,
  removeNode,
  settle,
  unwrapNode,
  wrapNode,
} from "@web-ui/footer/layout/layoutEdit";
import { ARKADIA_FOOTER_LAYOUT, STOCK_FOOTER_LAYOUT } from "@web-ui/footer/layout/presets";

/** Each band's blocks by kind, groups as nested arrays: what the outline shows. */
const shape = (layout: FooterLayout): unknown[] =>
  layout.bands.map((band) => {
    const draw = (node: FooterLayout["bands"][number]["children"][number]): unknown =>
      node.type === "block" ? node.block : node.children.map(draw);
    return band.children.map(draw);
  });

describe("layoutEdit", () => {
  it("moves a node within its band, to another band and into a group", () => {
    // vitals after the chips
    const within = moveNode(ARKADIA_FOOTER_LAYOUT, [1, 1], [1], 3)!;
    expect(shape(within.layout)).toEqual([["multibinds"], ["compass", "chips"].concat("vitals")]);
    expect(within.path).toEqual([1, 2]);

    // compass up into the binds band
    const across = moveNode(ARKADIA_FOOTER_LAYOUT, [1, 0], [0], 1)!;
    expect(shape(across.layout)).toEqual([["multibinds", "compass"], ["vitals", "chips"]]);

    const grouped = wrapNode(ARKADIA_FOOTER_LAYOUT, [1, 1], "column");
    const into = moveNode(grouped, [1, 2], [1, 1], 1)!;
    expect(shape(into.layout)).toEqual([["multibinds"], ["compass", ["vitals", "chips"]]]);
    expect(into.path).toEqual([1, 1, 1]);
  });

  it("will not move a group into itself", () => {
    const grouped = wrapNode(ARKADIA_FOOTER_LAYOUT, [1, 1], "row");
    expect(moveNode(grouped, [1, 1], [1, 1], 0)).toBeNull();
  });

  it("wraps and unwraps, and removes", () => {
    const grouped = wrapNode(STOCK_FOOTER_LAYOUT, [1, 0], "row");
    expect(nodeAt(grouped, [1, 0])).toMatchObject({ type: "row" });
    expect(unwrapNode(grouped, [1, 0])).toEqual(STOCK_FOOTER_LAYOUT);
    expect(shape(removeNode(STOCK_FOOTER_LAYOUT, [1, 2]))).toEqual([["multibinds", "reconnect"], ["vitals", "chips"]]);
  });

  it("lists the bands and nodes depth first", () => {
    expect(outline(ARKADIA_FOOTER_LAYOUT).map((row) => row.key)).toEqual(["0", "0.0", "1", "1.0", "1.1", "1.2"]);
  });

  it("points out a layout without a home for new chips", () => {
    expect(layoutWarnings(ARKADIA_FOOTER_LAYOUT)).toEqual([]);
    const noChips = removeNode(ARKADIA_FOOTER_LAYOUT, [1, 2]);
    expect(layoutWarnings(noChips)[0]).toMatch(/pozostałe plakietki/);
  });
});

describe("layoutEdit for the canvas", () => {
  it("moves a node into a band of its own and tidies what it left", () => {
    const moved = settle(moveToNewBand(ARKADIA_FOOTER_LAYOUT, [0, 0], 2)!);
    expect(shape(moved.layout)).toEqual([["compass", "vitals", "chips"], ["multibinds"]]);
    expect(moved.path).toEqual([1, 0]);
  });

  it("moves a band to another place among the bands", () => {
    expect(shape(moveBandTo(ARKADIA_FOOTER_LAYOUT, 0, 2))).toEqual([["compass", "vitals", "chips"], ["multibinds"]]);
    expect(shape(moveBandTo(ARKADIA_FOOTER_LAYOUT, 1, 0))).toEqual([["compass", "vitals", "chips"], ["multibinds"]]);
  });

  it("prunes empty groups and bands, keeping one band", () => {
    const grouped = wrapNode(ARKADIA_FOOTER_LAYOUT, [1, 1], "row");
    const emptied = removeNode(grouped, [1, 1, 0]);
    expect(shape(pruneLayout(emptied))).toEqual([["multibinds"], ["compass", "chips"]]);
    expect(pruneLayout({ bands: [{ children: [] }] })).toEqual({ bands: [{ children: [] }] });
  });
});

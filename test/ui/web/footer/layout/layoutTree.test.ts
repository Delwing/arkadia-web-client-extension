import type { FooterBlockNode, FooterLayout } from "@shared/footerLayoutTypes";
import { layoutTweaks, tweakLayout } from "@web-ui/footer/layout/layoutTree";
import { ARKADIA_FOOTER_LAYOUT, STOCK_FOOTER_LAYOUT } from "@web-ui/footer/layout/presets";

const blocks = (layout: FooterLayout): FooterBlockNode[] =>
  layout.bands.flatMap((band) => band.children).filter((node): node is FooterBlockNode => node.type === "block");
const block = (layout: FooterLayout, kind: FooterBlockNode["block"]) => blocks(layout).find((node) => node.block === kind);

describe("layoutTweaks", () => {
  it("reads the settings' starting values off a layout", () => {
    expect(layoutTweaks(ARKADIA_FOOTER_LAYOUT)).toEqual({
      chipLook: "text", chipArrange: "fold", chipRows: 4, vitalsPerRow: 4, improveBar: false, compass: true, compassWidth: 14, chipsWidth: 46,
    });
    expect(layoutTweaks(STOCK_FOOTER_LAYOUT)).toMatchObject({ chipLook: "icon", chipArrange: "fold", compass: false });
  });
});

describe("tweakLayout", () => {
  it("leaves the layout alone without tweaks", () => {
    expect(tweakLayout(ARKADIA_FOOTER_LAYOUT, undefined)).toBe(ARKADIA_FOOTER_LAYOUT);
  });

  it("adjusts the Arkadia grid, vitals and widths, and can drop the compass", () => {
    const layout = tweakLayout(ARKADIA_FOOTER_LAYOUT, {
      chipRows: 2, vitalsPerRow: 6, compassWidth: 20, chipsWidth: 30, chipLook: "icon",
    });
    expect(block(layout, "chips")).toMatchObject({ rows: 2, look: "icon", grow: 30 });
    expect(block(layout, "vitals")).toMatchObject({ perRow: 6, grow: 50 });
    expect(block(layout, "compass")).toMatchObject({ grow: 20 });

    expect(block(tweakLayout(ARKADIA_FOOTER_LAYOUT, { compass: false }), "compass")).toBeUndefined();
  });

  it("only touches what the layout has, and pulls values into range", () => {
    const layout = tweakLayout(STOCK_FOOTER_LAYOUT, { chipArrange: "wrap", chipRows: 99, vitalsPerRow: 3, chipsWidth: 30 });
    const rest = blocks(layout).find((node) => node.block === "chips" && node.items === "rest");
    expect(rest).toMatchObject({ arrange: "wrap" });
    expect(rest).not.toHaveProperty("rows");
    expect(rest).not.toHaveProperty("grow");
    expect(block(layout, "vitals")).not.toHaveProperty("perRow");
    // The connection keeps its own block untouched.
    expect(blocks(layout).filter((node) => node.block === "chips")[1]).toEqual(blocks(STOCK_FOOTER_LAYOUT).filter((node) => node.block === "chips")[1]);

    expect(block(tweakLayout(ARKADIA_FOOTER_LAYOUT, { chipRows: 99 }), "chips")).toMatchObject({ rows: 8 });
  });
});

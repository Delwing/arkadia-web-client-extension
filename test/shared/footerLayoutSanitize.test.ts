import { sanitizeFooterLayout } from "@shared/footerLayoutSanitize";
import { ARKADIA_FOOTER_LAYOUT, FORGE_FOOTER_LAYOUT, STOCK_FOOTER_LAYOUT } from "@web-ui/footer/layout/presets";

describe("sanitizeFooterLayout", () => {
  it("keeps every preset as it is", () => {
    for (const layout of [STOCK_FOOTER_LAYOUT, FORGE_FOOTER_LAYOUT, ARKADIA_FOOTER_LAYOUT]) {
      expect(sanitizeFooterLayout(layout)).toEqual(layout);
    }
  });

  it("drops what it does not know, pulls numbers into range, and empties out", () => {
    expect(sanitizeFooterLayout({
      bands: [
        {
          children: [
            { type: "block", block: "chips", items: "rest", arrange: "grid", rows: 40, look: "neon", grow: -3 },
            { type: "block", block: "teleporter" },
            { type: "row", children: [] },
            { type: "column", children: [{ type: "block", block: "vitals", perRow: 2.4, improveBar: "yes" }] },
          ],
        },
        { children: [{ type: "block", block: "nope" }] },
        "junk",
      ],
    })).toEqual({
      bands: [{
        children: [
          { type: "block", block: "chips", items: "rest", arrange: "grid", rows: 8, grow: 1 },
          { type: "column", children: [{ type: "block", block: "vitals", perRow: 2 }] },
        ],
      }],
    });
    expect(sanitizeFooterLayout({ bands: [] })).toBeNull();
    expect(sanitizeFooterLayout("{}")).toBeNull();
  });

  it("caps how deep groups nest", () => {
    let node: unknown = { type: "block", block: "vitals" };
    for (let i = 0; i < 10; i++) node = { type: "row", children: [node] };
    expect(sanitizeFooterLayout({ bands: [{ children: [node] }] })).toBeNull();
  });
});

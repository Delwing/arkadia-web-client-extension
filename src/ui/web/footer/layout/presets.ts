import type { FooterLayout, FooterPresetId } from "@shared/footerLayoutTypes";

/**
 * The stock footer: the location binds (shown only when there are any), then
 * the status line - vitals, every chip on one folding line, the connection
 * set apart at the end.
 */
export const STOCK_FOOTER_LAYOUT: FooterLayout = {
  bands: [
    { children: [{ type: "block", block: "multibinds" }] },
    {
      children: [
        { type: "block", block: "vitals" },
        { type: "block", block: "chips", items: "rest", arrange: "fold" },
        { type: "block", block: "chips", items: ["connection-status"], arrange: "wrap", quiet: true },
      ],
    },
  ],
};

/**
 * The forge HUD plate: the location binds (always there, so the plate keeps
 * its height) with the reconnect chip at their end, then the chips, then the
 * vitals with Postępy as a full-width bar under them.
 */
export const FORGE_FOOTER_LAYOUT: FooterLayout = {
  bands: [
    {
      children: [
        { type: "block", block: "multibinds", alwaysVisible: true },
        { type: "block", block: "reconnect" },
      ],
    },
    { children: [{ type: "block", block: "chips", items: "rest", arrange: "wrap" }] },
    { children: [{ type: "block", block: "vitals", improveBar: true }] },
  ],
};

/**
 * The Arkadia Mudlet footer: the location binds over three columns - the exits
 * as a compass rose, the vitals four to a line, and every chip as a
 * "Label: value" line in a grid four lines tall, filled column by column.
 */
export const ARKADIA_FOOTER_LAYOUT: FooterLayout = {
  bands: [
    { children: [{ type: "block", block: "multibinds", alwaysVisible: true }] },
    {
      children: [
        { type: "block", block: "compass", grow: 14 },
        { type: "block", block: "vitals", perRow: 4, grow: 40 },
        { type: "block", block: "chips", items: "rest", arrange: "grid", rows: 4, look: "text", grow: 46 },
      ],
    },
  ],
};

export const FOOTER_PRESETS: Record<FooterPresetId, FooterLayout> = {
  stock: STOCK_FOOTER_LAYOUT,
  forge: FORGE_FOOTER_LAYOUT,
  arkadia: ARKADIA_FOOTER_LAYOUT,
};

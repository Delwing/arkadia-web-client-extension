import type { FooterLayout } from "@shared/footerLayoutTypes";

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
 * vitals.
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
    { children: [{ type: "block", block: "vitals" }] },
  ],
};

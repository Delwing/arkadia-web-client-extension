import { setFooterPreviewHost } from "./layout/previewHost";
import { stockFooterSkin } from "./layout/stockSkin";
import { forgedFooterSkin, isForgedTheme } from "./layout/forgedSkin";
import { registerBuiltinFooterItems } from "./builtinItems";

/**
 * Ready the stock footer before <StockFooter> renders: the built-in chips of the
 * common footer registry (plugin items join as they come), and the layout
 * editor's preview, drawn the way this footer is drawn in the theme on when it opens.
 */
export function prepareStockFooter(): void {
  registerBuiltinFooterItems();
  setFooterPreviewHost({
    get skin() {
      return isForgedTheme() ? forgedFooterSkin : stockFooterSkin;
    },
    Frame: ({ children }) => <div id="footer-layout" className="footer-preview-frame">{children}</div>,
  });
}

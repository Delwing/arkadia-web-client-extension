import { MOBILE_FOOTER_QUERY } from "@web/mobileFooter";
import { useMediaQuery } from "../../hooks";
import FooterLayout from "./FooterLayout";
import { forgedFooterSkin, useForgedTheme } from "./forgedSkin";
import { STOCK_FOOTER_LAYOUT } from "./presets";
import { stockFooterSkin } from "./stockSkin";
import { useFooterLayout } from "./useFooterLayout";

/**
 * The footer in the layout the player picked, drawn as the Kuźnia
 * plate under that theme - which, when nothing is picked, also brings the
 * Forge layout the plate was made for. A phone keeps the stock one whatever the pick: the
 * phone footer (footerMobile.css) folds that status line into its two rails
 * and knows no other shape.
 */
export default function StockFooter() {
  const forged = useForgedTheme();
  const picked = useFooterLayout(forged ? "forge" : "stock");
  const phone = useMediaQuery(MOBILE_FOOTER_QUERY);
  if (phone) return <FooterLayout layout={STOCK_FOOTER_LAYOUT} skin={stockFooterSkin} />;
  return <FooterLayout layout={picked} skin={forged ? forgedFooterSkin : stockFooterSkin} />;
}

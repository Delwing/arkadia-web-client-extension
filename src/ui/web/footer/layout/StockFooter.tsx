import { MOBILE_FOOTER_QUERY } from "@web/mobileFooter";
import { useMediaQuery } from "../../hooks";
import FooterLayout from "./FooterLayout";
import { STOCK_FOOTER_LAYOUT } from "./presets";
import { stockFooterSkin } from "./stockSkin";
import { useFooterLayout } from "./useFooterLayout";

/**
 * The stock UI's footer in the layout the player picked. A phone keeps the
 * stock one whatever the pick: the phone footer (footerMobile.css) folds that
 * status line into its two rails and knows no other shape.
 */
export default function StockFooter() {
  const picked = useFooterLayout(STOCK_FOOTER_LAYOUT);
  const phone = useMediaQuery(MOBILE_FOOTER_QUERY);
  return <FooterLayout layout={phone ? STOCK_FOOTER_LAYOUT : picked} skin={stockFooterSkin} />;
}

import { useFooterItems } from "./useFooterItems";
import FooterItemView from "./FooterItemView";

/**
 * Renders the common registry's footer items — used by the stock UI, mounted
 * into its `#plugin-footer-components` slot so plugin-registered footer
 * components appear there. (The stock UI keeps its own built-in footer chips, so
 * only the dynamically-registered items flow through here; the forge HUD renders
 * both built-ins and these via FooterStrip.)
 */
export default function PluginFooterItems() {
  const items = useFooterItems();
  return (
    <>
      {items.map((item) => <FooterItemView key={item.id} item={item} />)}
    </>
  );
}

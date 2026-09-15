import { useFooterItems } from "./useFooterItems";
import FooterItemView from "./FooterItemView";

/**
 * Renders the common registry's footer items — used by the stock UI, mounted
 * into its `#plugin-footer-components` slot so plugin-registered footer
 * components appear there. (The stock UI keeps its own built-in footer chips, so
 * only the dynamically-registered items flow through here; the forge HUD renders
 * both built-ins and these via FooterStrip.)
 *
 * Each item carries its own flex `order`, and the slot is `display: contents`,
 * so these are laid out as siblings of the stock chips rather than as one block
 * wherever the slot happens to sit. Without that, the footer settings panel can
 * put a plugin component between two chips and the footer cannot honour it.
 */
export default function PluginFooterItems() {
  const items = useFooterItems();
  return (
    <>
      {items.map((item) => (
        <span key={item.id} className="footer-plugin-item" style={{ order: item.order }}>
          <FooterItemView item={item} />
        </span>
      ))}
    </>
  );
}

import { useFooterItems } from "./useFooterItems";
import FooterItemView from "./FooterItemView";

/**
 * The footer status-chip band. Renders whatever the common registry hands over —
 * the built-in chips (already filtered/ordered by the user's
 * `uiSettings.footerComponents` config) merged with any plugin items. A chip
 * still self-hides when its own data is absent, so the row only shows what's
 * currently relevant.
 *
 * Built-ins must be registered once first via `registerBuiltinFooterItems()`
 * (the forge HUD does this at bootstrap). Excluded from the built-in set only by
 * the user's config — nothing is hardcoded-hidden here.
 */
export default function FooterStrip() {
  const items = useFooterItems();
  return (
    <div className="footer-strip">
      {items.map((item) => <FooterItemView key={item.id} item={item} />)}
    </div>
  );
}

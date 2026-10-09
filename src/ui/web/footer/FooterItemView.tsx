import type { FooterItem } from "@modules/core/footerRegistry";
import FooterNodeHost from "./FooterNodeHost";
import { useFooterPreview } from "./layout/previewContext";

/**
 * Renders one registry footer item, handling both kinds: React content
 * (`render`, used by built-in chips) and a raw DOM node (`node`, used by plugin
 * components, adopted via FooterNodeHost).
 */
export default function FooterItemView({ item }: { item: FooterItem }) {
  const preview = useFooterPreview();
  // A plugin's node lives in the real footer; a preview only names it.
  if (item.node && preview) return <span className="chip footer-preview-plugin">{item.label ?? item.id}</span>;
  if (item.node) return <FooterNodeHost node={item.node} />;
  return <>{item.render?.()}</>;
}

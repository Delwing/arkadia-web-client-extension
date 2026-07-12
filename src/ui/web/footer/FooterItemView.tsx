import type { FooterItem } from "@modules/core/footerRegistry";
import FooterNodeHost from "./FooterNodeHost";

/**
 * Renders one registry footer item, handling both kinds: React content
 * (`render`, used by built-in chips) and a raw DOM node (`node`, used by plugin
 * components, adopted via FooterNodeHost).
 */
export default function FooterItemView({ item }: { item: FooterItem }) {
  if (item.node) return <FooterNodeHost node={item.node} />;
  return <>{item.render?.()}</>;
}

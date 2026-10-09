import type { FooterBand, FooterBlockId, FooterLayout, FooterNode } from "@shared/footerLayoutTypes";

/** Every chip id some chip block lists by name - what `rest` leaves out. */
export function claimedChipIds(layout: FooterLayout): Set<string> {
  const claimed = new Set<string>();
  const visit = (node: FooterNode) => {
    if (node.type === "block") {
      if (node.block === "chips" && Array.isArray(node.items)) node.items.forEach((id) => claimed.add(id));
    } else {
      node.children.forEach(visit);
    }
  };
  layout.bands.forEach((band) => band.children.forEach(visit));
  return claimed;
}

/** True when the band holds a block of that kind anywhere inside it. */
export function bandHas(band: FooterBand, block: FooterBlockId): boolean {
  const visit = (node: FooterNode): boolean =>
    node.type === "block" ? node.block === block : node.children.some(visit);
  return band.children.some(visit);
}

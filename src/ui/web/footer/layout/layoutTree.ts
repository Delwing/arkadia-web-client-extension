import type { FooterBand, FooterBlockId, FooterLayout, FooterLayoutTweaks, FooterNode } from "@shared/footerLayoutTypes";

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

const clamp = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : undefined;

/**
 * The layout with the player's tweaks applied (see FooterLayoutTweaks). Only
 * what a layout already has is adjusted: a width share goes to nodes that had
 * one, a grid's rows to a grid; the main chips are the `rest` block. Values
 * out of range are pulled into it, nonsense ones ignored.
 */
export function tweakLayout(layout: FooterLayout, tweaks: FooterLayoutTweaks | undefined): FooterLayout {
  if (!tweaks) return layout;
  const rows = clamp(tweaks.chipRows, 1, 8);
  const perRow = clamp(tweaks.vitalsPerRow, 1, 11);
  const compassWidth = clamp(tweaks.compassWidth, 5, 40);
  const chipsWidth = clamp(tweaks.chipsWidth, 10, 80);
  const vitalsWidth = Math.max(10, 100 - (compassWidth ?? 14) - (chipsWidth ?? 46));

  const tweak = (node: FooterNode): FooterNode | null => {
    if (node.type !== "block") {
      return { ...node, children: node.children.map(tweak).filter((child): child is FooterNode => child !== null) };
    }
    const has = node.grow !== undefined;
    switch (node.block) {
      case "compass":
        if (tweaks.compass === false) return null;
        return has && compassWidth !== undefined ? { ...node, grow: compassWidth } : node;
      case "vitals":
        return {
          ...node,
          ...(typeof tweaks.improveBar === "boolean" ? { improveBar: tweaks.improveBar } : {}),
          ...(perRow !== undefined && node.perRow !== undefined ? { perRow } : {}),
          ...(has && (compassWidth !== undefined || chipsWidth !== undefined) ? { grow: vitalsWidth } : {}),
        };
      case "chips": {
        if (node.items !== "rest") return node;
        const next = { ...node };
        if (tweaks.chipLook === "icon" || tweaks.chipLook === "text") next.look = tweaks.chipLook;
        if ((tweaks.chipArrange === "fold" || tweaks.chipArrange === "wrap") && node.arrange !== "grid") next.arrange = tweaks.chipArrange;
        if (rows !== undefined && node.arrange === "grid") next.rows = rows;
        if (has && chipsWidth !== undefined) next.grow = chipsWidth;
        return next;
      }
      default:
        return node;
    }
  };

  return {
    bands: layout.bands.map((band) => ({
      ...band,
      children: band.children.map(tweak).filter((child): child is FooterNode => child !== null),
    })),
  };
}

/** What a layout's tweakable settings are as it stands - the settings' starting values. */
export function layoutTweaks(layout: FooterLayout): Required<FooterLayoutTweaks> {
  const found: Required<FooterLayoutTweaks> = {
    chipLook: "icon", chipArrange: "fold", chipRows: 4, vitalsPerRow: 4, improveBar: false, compass: false, compassWidth: 14, chipsWidth: 46,
  };
  const visit = (node: FooterNode) => {
    if (node.type !== "block") {
      node.children.forEach(visit);
      return;
    }
    if (node.block === "chips" && node.items === "rest") {
      found.chipLook = node.look ?? "icon";
      if (node.arrange !== "grid") found.chipArrange = node.arrange;
      if (node.rows !== undefined) found.chipRows = node.rows;
      if (node.grow !== undefined) found.chipsWidth = node.grow;
    } else if (node.block === "vitals") {
      if (node.perRow !== undefined) found.vitalsPerRow = node.perRow;
      found.improveBar = node.improveBar === true;
    } else if (node.block === "compass") {
      found.compass = true;
      if (node.grow !== undefined) found.compassWidth = node.grow;
    }
  };
  layout.bands.forEach((band) => band.children.forEach(visit));
  return found;
}

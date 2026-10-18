import { useSyncExternalStore } from "react";
import VitalGems from "../VitalGems";
import type { FooterSkin } from "./FooterLayout";
import { stockFooterSkin } from "./stockSkin";

const FORGED_CLASS = "theme-forged";

/** Whether the Kuźnia theme is on - the class the settings put on <body>, previews included. */
export function isForgedTheme(): boolean {
  return typeof document !== "undefined" && document.body.classList.contains(FORGED_CLASS);
}

function subscribeToBodyClass(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export const useForgedTheme = (): boolean => useSyncExternalStore(subscribeToBodyClass, isForgedTheme, () => false);

/**
 * The stock footer drawn as the Kuźnia plate: the stock bands (their ids are
 * what the footer CSS, the phone footer and e2e know), an engraved seam
 * between them, and the vitals as stone gems (Postępy as a bar under them
 * when the layout asks, so they stack in the stock vitals column).
 */
export const forgedFooterSkin: FooterSkin = {
  band: stockFooterSkin.band,
  separator: () => <div className="hud-seam" />,
  block(node) {
    if (node.block === "vitals") {
      return (
        <div className="footer-vitals">
          <VitalGems improveBar={node.improveBar === true} />
        </div>
      );
    }
    return stockFooterSkin.block?.(node);
  },
};

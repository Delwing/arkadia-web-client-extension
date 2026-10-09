import type { ComponentType, ReactNode } from "react";
import type { FooterSkin } from "./FooterLayout";
import { stockFooterSkin } from "./stockSkin";

/**
 * How the UI in use draws its footer, for the layout editor's preview to draw
 * it the same: the skin, and the frame the footer sits in (its ancestors as far
 * as its stylesheet leans on them).
 */
export interface FooterPreviewHost {
  skin: FooterSkin;
  Frame: ComponentType<{ children: ReactNode }>;
}

let host: FooterPreviewHost | null = null;

/** Each UI registers itself as it boots. */
export function setFooterPreviewHost(next: FooterPreviewHost): void {
  host = next;
}

/** The registered UI's way, or the stock footer's without one. */
export function getFooterPreviewHost(): FooterPreviewHost {
  return host ?? { skin: stockFooterSkin, Frame: ({ children }) => children };
}

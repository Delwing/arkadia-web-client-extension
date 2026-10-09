import { useEffect, useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import { globalStorage } from "@modules/core/storage";
import type { FooterBand, FooterLayout } from "@shared/footerLayoutTypes";
import MultiBindStrip from "../MultiBindStrip";
import { FooterButtonSheet } from "../FooterButtons";
import type { FooterSkin } from "./FooterLayout";

function readFooterMode(): number {
  const mode = (globalStorage.get("uiSettings") as { footerMode?: number } | null)?.footerMode;
  return typeof mode === "number" ? mode : 4;
}

/**
 * The location binds in the `#multi-binds` row, which shows only while it is
 * `.active` - while there are binds, or always when the player keeps it (main.ts
 * watches that class to hold the split view still while the row comes and goes).
 */
function StockBinds({ alwaysVisible }: { alwaysVisible?: boolean }) {
  const [active, setActive] = useState(false);
  return (
    <div id="multi-binds" className={active ? "active" : undefined}>
      <MultiBindStrip alwaysVisible={alwaysVisible} onActiveChange={setActive} />
    </div>
  );
}

/**
 * The status line, `#char-state`: the band the footer CSS, the phone footer
 * (mobileFooter.ts, which wires the expander) and the e2e specs know. It carries
 * the vitals mode for the stylesheet, the phone expander and the phone's button
 * sheet besides the band's own blocks.
 */
function StatusLine({ children }: { children: ReactNode }) {
  const [footerMode, setFooterMode] = useState(readFooterMode);
  useEffect(() => globalStorage.onChange("uiSettings", () => setFooterMode(readFooterMode())), []);
  return (
    <div id="char-state" data-footer-mode={footerMode}>
      {children}
      <button id="footer-expand" type="button" className="status-expand">
        <ChevronUp size={14} strokeWidth={2.2} />
      </button>
      {/* Phone only (footerMobile.css shows it): the sheet's button grid. */}
      <FooterButtonSheet />
    </div>
  );
}

const bindsOnly = (band: FooterBand) =>
  band.children.length === 1 && band.children[0].type === "block" && band.children[0].block === "multibinds";

/** The band that becomes the status line: the first one that is not just the binds. */
const statusIndex = (layout: FooterLayout) => layout.bands.findIndex((band) => !bindsOnly(band));

/**
 * The stock UI's footer: each band its own full-width row under the output. A
 * band of nothing but the binds is the `#multi-binds` row itself; the first
 * other band is the status line.
 */
export const stockFooterSkin: FooterSkin = {
  band({ band, index, layout, children }) {
    if (bindsOnly(band)) return children;
    if (index === statusIndex(layout)) return <StatusLine>{children}</StatusLine>;
    return <div className="footer-band">{children}</div>;
  },
  block(node) {
    if (node.block === "multibinds") return <StockBinds alwaysVisible={node.alwaysVisible} />;
    return undefined;
  },
};

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import { globalStorage } from "@modules/core/storage";
import type { FooterBand, FooterLayout } from "@shared/footerLayoutTypes";
import MultiBindStrip from "../MultiBindStrip";
import { FooterButtonSheet } from "../FooterButtons";
import type { FooterSkin } from "./FooterLayout";
import { bandHas } from "./layoutTree";

function readFooterMode(): number {
  const mode = (globalStorage.get("uiSettings") as { footerMode?: number } | null)?.footerMode;
  return typeof mode === "number" ? mode : 4;
}

/** How the binds tell their row whether it has anything to show. */
const BindsActive = createContext<(active: boolean) => void>(() => {});

/**
 * The band with the location binds: the `#multi-binds` row, which shows only
 * while it is `.active` - while there are binds, or always when the player
 * keeps it (main.ts watches that class to hold the split view still while the
 * row comes and goes). Whatever else the band holds rides along in it.
 */
function BindsRow({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  return (
    <div id="multi-binds" className={active ? "active" : undefined}>
      <BindsActive.Provider value={setActive}>{children}</BindsActive.Provider>
    </div>
  );
}

function StockBinds({ alwaysVisible }: { alwaysVisible?: boolean }) {
  const setActive = useContext(BindsActive);
  return <MultiBindStrip alwaysVisible={alwaysVisible} onActiveChange={setActive} />;
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

const holdsBinds = (band: FooterBand) => bandHas(band, "multibinds");

/** The band that becomes the status line: the first one without the binds. */
const statusIndex = (layout: FooterLayout) => layout.bands.findIndex((band) => !holdsBinds(band));

/**
 * The stock UI's footer: each band its own full-width row under the output. The
 * band with the binds is the `#multi-binds` row; the first other band is the
 * status line.
 */
export const stockFooterSkin: FooterSkin = {
  band({ band, index, layout, children }) {
    if (holdsBinds(band)) return <BindsRow>{children}</BindsRow>;
    if (index === statusIndex(layout)) return <StatusLine>{children}</StatusLine>;
    return <div className="footer-band">{children}</div>;
  },
  block(node) {
    if (node.block === "multibinds") return <StockBinds alwaysVisible={node.alwaysVisible} />;
    return undefined;
  },
};

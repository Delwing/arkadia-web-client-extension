import { Fragment, useMemo, type ReactNode } from "react";
import type { FooterBand, FooterBlockNode, FooterLayout as Layout, FooterNode } from "@shared/footerLayoutTypes";
import MultiBindStrip from "../MultiBindStrip";
import Vitals from "../Vitals";
import ChipZone from "../ChipZone";
import { claimedChipIds } from "./layoutTree";

/**
 * How one UI draws the footer layout. The layout decides what goes where; the
 * skin decides the markup each band and block gets, so the stock UI keeps its
 * ids and classes (CSS, the phone footer and e2e lean on them) and the forge
 * HUD keeps its plate.
 */
export interface FooterSkin {
  /** Wraps one band; `children` are its nodes, already drawn. */
  band(props: { band: FooterBand; index: number; layout: Layout; children: ReactNode }): ReactNode;
  /** Drawn between two bands (the forge plate's engraved seam). */
  separator?: () => ReactNode;
  /** The UI's own take on a block; `undefined` falls back to the shared one. */
  block?(node: FooterBlockNode): ReactNode | undefined;
}

function sharedBlock(node: FooterBlockNode, claimed: ReadonlySet<string>): ReactNode {
  switch (node.block) {
    case "chips":
      return <ChipZone block={node} claimed={claimed} />;
    case "multibinds":
      return <MultiBindStrip alwaysVisible={node.alwaysVisible} />;
    case "vitals":
      return (
        <div id="char-state-vitals" className="status-vitals">
          <Vitals />
        </div>
      );
    case "reconnect":
      return null;
  }
}

/** The footer, as `layout` arranges it and `skin` draws it. */
export default function FooterLayout({ layout, skin }: { layout: Layout; skin: FooterSkin }) {
  const claimed = useMemo(() => claimedChipIds(layout), [layout]);

  const draw = (node: FooterNode, key: number): ReactNode => {
    if (node.type === "block") {
      const own = skin.block?.(node);
      return <Fragment key={key}>{own !== undefined ? own : sharedBlock(node, claimed)}</Fragment>;
    }
    return (
      <div key={key} className={`footer-${node.type}`}>
        {node.children.map(draw)}
      </div>
    );
  };

  return (
    <>
      {layout.bands.map((band, index) => (
        <Fragment key={index}>
          {index > 0 && skin.separator?.()}
          {skin.band({ band, index, layout, children: band.children.map(draw) })}
        </Fragment>
      ))}
    </>
  );
}

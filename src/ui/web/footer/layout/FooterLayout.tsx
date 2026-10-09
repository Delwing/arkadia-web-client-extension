import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import type { FooterBand, FooterBlockNode, FooterLayout as Layout, FooterNode } from "@shared/footerLayoutTypes";
import MultiBindStrip from "../MultiBindStrip";
import Vitals from "../Vitals";
import ChipZone from "../ChipZone";
import ExitCompass from "../ExitCompass";
import ImproveBar from "../ImproveBar";
import { claimedChipIds } from "./layoutTree";
import { useFooterPreview } from "./previewContext";

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

/**
 * Wraps what the layout draws for each band and node (the layout editor marks
 * them out to select and drag); `path` is `[band]` or `[band, child, ...]`.
 */
export type FooterDecorator = (props: { path: readonly number[]; node?: FooterNode; children: ReactNode }) => ReactNode;

function sharedBlock(node: FooterBlockNode, claimed: ReadonlySet<string>, preview: boolean): ReactNode {
  switch (node.block) {
    case "chips":
      return <ChipZone block={node} claimed={claimed} />;
    case "multibinds":
      return <MultiBindStrip alwaysVisible={node.alwaysVisible || preview} />;
    case "vitals": {
      const row = (
        <div
          id="char-state-vitals"
          className={`status-vitals${node.perRow ? " status-vitals--grid" : ""}`}
          style={node.perRow ? ({ "--vitals-per-row": node.perRow } as CSSProperties) : undefined}
        >
          <Vitals withoutImprove={node.improveBar} />
        </div>
      );
      if (!node.improveBar) return row;
      return (
        <div className="footer-vitals">
          {row}
          <ImproveBar />
        </div>
      );
    }
    case "compass":
      return <ExitCompass />;
    case "reconnect":
      return null;
  }
}

/** The footer, as `layout` arranges it and `skin` draws it. */
export default function FooterLayout({ layout, skin, decorate }: { layout: Layout; skin: FooterSkin; decorate?: FooterDecorator }) {
  const claimed = useMemo(() => claimedChipIds(layout), [layout]);
  const preview = useFooterPreview();

  const draw = (node: FooterNode, path: number[]): ReactNode => {
    let drawn: ReactNode;
    if (node.type === "block") {
      const own = skin.block?.(node);
      drawn = own !== undefined ? own : sharedBlock(node, claimed, preview);
    } else {
      drawn = <div className={`footer-${node.type}`}>{node.children.map((child, i) => draw(child, [...path, i]))}</div>;
    }
    // A node with a share of the width gets a cell holding exactly that share.
    if (node.grow !== undefined) {
      drawn = <div className="footer-cell" style={{ flexGrow: node.grow, flexShrink: 1, flexBasis: 0 }}>{drawn}</div>;
    }
    return <Fragment key={path.join(".")}>{decorate ? decorate({ path, node, children: drawn }) : drawn}</Fragment>;
  };

  return (
    <>
      {layout.bands.map((band, index) => {
        const drawn = skin.band({ band, index, layout, children: band.children.map((child, i) => draw(child, [index, i])) });
        return (
          <Fragment key={index}>
            {index > 0 && skin.separator?.()}
            {decorate ? decorate({ path: [index], children: drawn }) : drawn}
          </Fragment>
        );
      })}
    </>
  );
}

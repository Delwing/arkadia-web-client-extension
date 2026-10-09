import type { FooterSkin } from '@web-ui/footer/layout/FooterLayout';
import { bandHas } from '@web-ui/footer/layout/layoutTree';
import VitalGems from './VitalGems';
import ReconnectChip from './ReconnectChip';

/**
 * The footer as bands of the forge HUD plate, each parted from the next by an
 * engraved seam. The band with the location binds is the always-present bind
 * strip (the binds keep its left, anything after them is pushed to its right
 * end); a band of a single block is that block itself, flush in the plate.
 */
export const forgeFooterSkin: FooterSkin = {
    band({ band, children }) {
        if (bandHas(band, 'multibinds')) return <div className="multibind-strip">{children}</div>;
        if (band.children.length === 1) return children;
        return <div className="footer-band">{children}</div>;
    },
    separator: () => <div className="hud-seam" />,
    block(node) {
        if (node.block === 'vitals') return <VitalGems improveBar={node.improveBar === true} />;
        if (node.block === 'reconnect') return <ReconnectChip />;
        return undefined;
    },
};

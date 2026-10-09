/**
 * The footer layout: which pieces the footer has and how they are arranged,
 * shared by every UI. A layout is a stack of bands, top to bottom; each band is
 * a row of nodes, and a node is a block (one footer piece) or a nested row or
 * column of nodes.
 *
 * The layout says what goes where; how a piece looks is the UI's own skin (see
 * @web-ui/footer/layout/FooterLayout). A UI that cannot draw a block in some
 * form falls back to its own way of drawing it, or leaves it out.
 */

/** Chips nobody placed explicitly: every block with `items: "rest"` shares them. */
export type FooterChipItems = 'rest' | string[];

/**
 * How a chip block lays its chips out.
 * - `fold`: one line; whatever wraps past it hides behind a "+N" toggle.
 * - `wrap`: as many lines as the chips need.
 */
export type FooterChipArrange = 'fold' | 'wrap';

export interface FooterChipsBlock {
    type: 'block';
    block: 'chips';
    /**
     * The chips this block shows: listed ids in that order, or `rest` - every
     * registry item (built-in or plugin) no other chip block lists, in the
     * player's configured order. A plugin's new chip lands in `rest`.
     */
    items: FooterChipItems;
    arrange: FooterChipArrange;
    /** Set apart and dimmed - a diagnostic rather than a status (the connection). */
    quiet?: boolean;
}

export interface FooterMultibindsBlock {
    type: 'block';
    block: 'multibinds';
    /** Keep the row, with its placeholder, when the room has no binds. */
    alwaysVisible?: boolean;
}

export interface FooterVitalsBlock {
    type: 'block';
    block: 'vitals';
}

/** The way back to the game after a dropped session, for UIs without one elsewhere. */
export interface FooterReconnectBlock {
    type: 'block';
    block: 'reconnect';
}

export type FooterBlockNode =
    | FooterChipsBlock
    | FooterMultibindsBlock
    | FooterVitalsBlock
    | FooterReconnectBlock;

export type FooterBlockId = FooterBlockNode['block'];

export interface FooterGroupNode {
    type: 'row' | 'column';
    children: FooterNode[];
}

export type FooterNode = FooterBlockNode | FooterGroupNode;

/** One horizontal band of the footer: a row of nodes. */
export interface FooterBand {
    children: FooterNode[];
}

export interface FooterLayout {
    /** Top to bottom. */
    bands: FooterBand[];
}

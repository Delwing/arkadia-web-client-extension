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
 * - `grid`: `rows` lines, filled top to bottom and then column by column.
 */
export type FooterChipArrange = 'fold' | 'wrap' | 'grid';

/**
 * How a chip reads: `icon` - a glyph, a caps label and the value, on a tile;
 * `text` - a plain "Label: value" line.
 */
export type FooterChipLook = 'icon' | 'text';

/** What every node can say about its share of the band. */
interface FooterNodeBase {
    /** Share of the row's width against its siblings (flex-grow); unset takes what it needs. */
    grow?: number;
}

export interface FooterChipsBlock extends FooterNodeBase {
    type: 'block';
    block: 'chips';
    /**
     * The chips this block shows: listed ids in that order, or `rest` - every
     * registry item (built-in or plugin) no other chip block lists, in the
     * player's configured order. A plugin's new chip lands in `rest`.
     */
    items: FooterChipItems;
    arrange: FooterChipArrange;
    /** Lines of a `grid` (4 when unset). */
    rows?: number;
    look?: FooterChipLook;
    /** Set apart and dimmed - a diagnostic rather than a status (the connection). */
    quiet?: boolean;
}

export interface FooterMultibindsBlock extends FooterNodeBase {
    type: 'block';
    block: 'multibinds';
    /** Keep the row, with its placeholder, when the room has no binds. */
    alwaysVisible?: boolean;
}

export interface FooterVitalsBlock extends FooterNodeBase {
    type: 'block';
    block: 'vitals';
    /** Vitals per line, wrapping onto more lines; unset keeps them on one. */
    perRow?: number;
}

/** The current room's exits as a clickable compass rose, special exits beside it. */
export interface FooterCompassBlock extends FooterNodeBase {
    type: 'block';
    block: 'compass';
}

/** The way back to the game after a dropped session, for UIs without one elsewhere. */
export interface FooterReconnectBlock extends FooterNodeBase {
    type: 'block';
    block: 'reconnect';
}

export type FooterBlockNode =
    | FooterChipsBlock
    | FooterMultibindsBlock
    | FooterVitalsBlock
    | FooterCompassBlock
    | FooterReconnectBlock;

export type FooterBlockId = FooterBlockNode['block'];

export interface FooterGroupNode extends FooterNodeBase {
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

/** The layouts that come with the client. */
export const FOOTER_PRESET_IDS: readonly string[] = ['stock', 'forge', 'arkadia'];
export type FooterPresetId = 'stock' | 'forge' | 'arkadia';

/**
 * The few knobs a picked layout offers in the settings (Stopka -> Układ
 * stopki), so a player can adjust it without building their own. Each layout
 * offers only the ones that mean something in it (FOOTER_PRESET_TWEAKS).
 */
export interface FooterLayoutTweaks {
    /** How the main chips read: on tiles with a glyph, or as "Label: value" lines. */
    chipLook?: FooterChipLook;
    /** The main chips on one line with the rest behind "+N", or on as many lines as they need. */
    chipArrange?: 'fold' | 'wrap';
    /** Lines in the chip grid. */
    chipRows?: number;
    /** Vitals per line. */
    vitalsPerRow?: number;
    /** Show the exit compass. */
    compass?: boolean;
    /** Width shares, in percent of the band; the vitals take what is left. */
    compassWidth?: number;
    chipsWidth?: number;
}

export type FooterLayoutTweak = keyof FooterLayoutTweaks;

/** The tweaks each layout offers, in the order the settings show them. */
export const FOOTER_PRESET_TWEAKS: Record<FooterPresetId, readonly FooterLayoutTweak[]> = {
    stock: ['chipLook', 'chipArrange'],
    forge: ['chipLook'],
    arkadia: ['chipLook', 'chipRows', 'vitalsPerRow', 'compass', 'compassWidth', 'chipsWidth'],
};

/** Every layout's own tweaks, kept apart so switching layouts loses nothing. */
export type FooterLayoutTweakSet = Partial<Record<FooterPresetId, FooterLayoutTweaks>>;

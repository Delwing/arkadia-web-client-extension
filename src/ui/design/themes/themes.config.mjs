/**
 * Theme catalogue for the Arkadia design system — the single source of truth.
 *
 * A theme is two Radix colour scales (a neutral and an accent) plus an
 * appearance. `yarn build:design-tokens` turns this file into
 * `src/ui/design/css/scales.generated.css`, which declares
 * `--ark-gray-1..12` / `--ark-accent-1..12` (and the alpha variants) under
 * `[data-ark-theme="<id>"]`. Everything else in the system reads the semantic
 * tokens in `tokens.css`, which are defined once, in terms of those steps.
 *
 * That is the whole reason for picking Radix Colours: the steps have fixed
 * meanings across every scale (see `css/tokens.css` for the role table), so a
 * new theme is a few lines here rather than a hand-tuned palette.
 *
 * `solidNeedsDarkText` marks the scales whose step 9 is bright enough that
 * text on it must be near-black (amber, yellow, lime, mint, sky in Radix's
 * own taxonomy). It drives `--ark-accent-contrast`.
 *
 * This file is plain ESM with no imports so both the Node generator and the
 * Vitest suite can read it directly.
 */

/** Radix scales whose step 9 is a light solid and needs dark foreground text. */
export const BRIGHT_SOLID_SCALES = ['amber', 'yellow', 'lime', 'mint', 'sky'];

/**
 * @typedef {Object} ThemeDefinition
 * @property {string} id        Value of the `data-ark-theme` attribute.
 * @property {string} label     Player-facing name (Polish — this is a Polish client).
 * @property {'dark'|'light'} appearance Drives `color-scheme` and the shadow ramp.
 * @property {string} gray      Radix neutral scale name.
 * @property {string} accent    Radix accent scale name.
 */

/** @type {ThemeDefinition[]} */
export const THEMES = [
  {
    id: 'arkadia',
    label: 'Arkadia (ciemny)',
    appearance: 'dark',
    gray: 'sand',
    // Blue, not amber: this is the theme `default` maps onto, and the stock
    // client's accent was Bootstrap's blue long before the redesign. Keeping it
    // means the default theme does not change colour out from under players.
    accent: 'blue',
  },
  {
    id: 'dark-neutral',
    label: 'Neutralny ciemny',
    appearance: 'dark',
    gray: 'gray',
    accent: 'blue',
  },
  {
    id: 'fantasy',
    label: 'Fantasy',
    appearance: 'dark',
    gray: 'mauve',
    accent: 'purple',
  },
  {
    id: 'forest',
    label: 'Las',
    appearance: 'dark',
    gray: 'olive',
    accent: 'grass',
  },
  {
    id: 'icy',
    label: 'Lodowy',
    appearance: 'dark',
    gray: 'slate',
    accent: 'sky',
  },
  {
    id: 'gray',
    label: 'Szary',
    appearance: 'dark',
    gray: 'gray',
    accent: 'slate',
  },
  {
    id: 'parchment',
    label: 'Pergamin (jasny)',
    appearance: 'light',
    gray: 'sand',
    accent: 'bronze',
  },
  {
    id: 'silver',
    label: 'Srebrny (jasny)',
    appearance: 'light',
    gray: 'slate',
    accent: 'indigo',
  },
];

/** The theme used when nothing else is selected. */
export const DEFAULT_THEME = 'arkadia';

/**
 * Fixed status hues. These do NOT follow the accent: a danger state has to read
 * as danger in every theme, and a per-theme danger colour is how you end up with
 * a green "your character died" tag in the forest theme.
 */
export const STATUS_SCALES = {
  success: 'grass',
  warning: 'amber',
  danger: 'tomato',
  info: 'blue',
};

export function isBrightSolid(scale) {
  return BRIGHT_SOLID_SCALES.includes(scale);
}

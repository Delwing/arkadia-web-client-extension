// Loads the stock panel layout classes, scoped to the forge menu modal
// (forge-menu-stock.scss). This module's side-effect import is what pulls that
// compiled CSS in.
//
// It's imported dynamically (first modal open, from MenuModalHost) so the
// stylesheet stays out of forge's initial chunk - Vite emits it as a CSS chunk
// that loads with this module.

import './forge-menu-stock.scss';

/**
 * Ensures the scoped stylesheet is loaded. Importing this module (the
 * side-effect import above) is the injection; this function is a no-op the host
 * calls to express intent and to keep the dynamic import from being tree-shaken.
 */
export function injectMenuStockCss(): void {
    /* no-op — see module header */
}

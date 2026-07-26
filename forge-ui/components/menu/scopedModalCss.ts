// Loads the forge-scoped Bootstrap stylesheet for the menu modals.
//
// The stock settings/editors are authored against Bootstrap; forge can't load
// Bootstrap globally without repainting its own chrome. `forge-modal-bootstrap.scss`
// compiles the real Bootstrap source with every selector nested under
// `.forge-menu-modal` (plain descendant selectors — no runtime `@scope`), and
// this module's side-effect import is what pulls that compiled CSS in.
//
// It's imported dynamically (first modal open, from MenuModalHost) so the
// stylesheet stays out of forge's initial chunk — Vite emits it as a CSS chunk
// that loads with this module.

import './forge-modal-bootstrap.scss';

/**
 * Ensures the scoped Bootstrap stylesheet is loaded. Importing this module (the
 * side-effect import above) is the injection; this function is a no-op the host
 * calls to express intent and to keep the dynamic import from being tree-shaken.
 */
export function injectScopedModalCss(): void {
    /* no-op — see module header */
}

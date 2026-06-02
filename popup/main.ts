/**
 * Stylesheet-only entry for popped-out panels.
 *
 * A popped-out panel opens this page with window.open(); the MAIN client's
 * React tree then portals the panel's content into #popout-root. This module
 * exists purely so the popout document loads the full app stylesheet bundle
 * through a real, same-origin navigation — injecting the opener's styles into
 * an about:blank window proved unreliable across browsers (cloned/linked
 * stylesheets never fetched). Keep this free of app bootstrap logic: no
 * sockets, no client, just the styles.
 *
 * The set below mirrors the global CSS imported by src/web/main.ts. If a new
 * global stylesheet is added there, add it here too.
 */
import 'bootswatch/dist/darkly/bootstrap.min.css';
import '@web/style.css';
import '@web/themes/fantasy.css';
import '@web/themes/forest.css';
import '@web/themes/icy.css';
import '@web/themes/gray.css';
import '@web/themes/dark-neutral.css';
import '@web/themes/light-parchment.css';
import '@web/themes/light-silver.css';
import '@web/layout/layout.css';

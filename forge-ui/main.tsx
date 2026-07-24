/**
 * Forge UI — the "Forged" HUD (React).
 *
 * Builds the full game client (transport, triggers, rendering, input, vitals)
 * via the same stable contract the stock UI uses, then renders the HUD around it.
 * The client is provided through ClientContext; DOM-bound wiring (width measurer,
 * map mount, game-log append) runs inside component effects.
 */
import './style.css';
// Shared, var-driven popup body styles (see src/web/popups/popups.css).
import '@web/popups/popups.css';
// Forge adopts the shared dock/layout manager. layout.css brings the
// dock grid + panel/floating chrome; layout-theme.css re-skins it forged.
// NOTE: layout.css is intentionally NOT JS-imported here — it is pulled in via an
// `@import` at the TOP of layout-theme.css instead. A JS-imported layout.css is
// shared across three entries, so Rollup extracts it into its own CSS chunk that
// the built HTML links AFTER forge's entry CSS — flipping the cascade in prod
// (fine in dev) so every forge override that ties layout.css loses. The @import
// inlines layout.css into forge's entry chunk in source order, ahead of the
// overrides, so prod matches dev. See layout-theme.css.
import './layout-theme.css';
// Command-rail menu button, its dropdown, and the forged modal shell (with a
// scoped Bootstrap-form subset) that hosts the stock settings/editors.
import './components/menu/menu.css';
// Desktop buttons, mobile direction pad & mobile command radial — shared
// React components (@web-ui/buttons). buttons-theme.css @imports their base
// stylesheets ahead of forge's re-skin (border/shadow/font only — per-button
// colors stay settings-driven); see its header for why they're @imported
// there rather than JS-imported here.
import './buttons-theme.css';
// The login screen (over the whole HUD while disconnected) and its footer
// reconnect chip.
import './components/login.css';
import { createRoot } from 'react-dom/client';
import {
    setDockingSupported,
    setRailSpanSupported,
    loadLayoutState,
    saveLayoutState,
} from '@web/layout/utils/layoutStorage';
import { setObjectListChrome } from '@web/layout/builtInChrome';
import { createClient } from './client/bootstrap';
import { ClientProvider } from './client/ClientContext';
import App from './components/App';

// Forge renders real dock slots (via LayoutManagerWrapper), so
// docking IS supported here. Must run before the first popup component mounts
// (usePopup reads this synchronously).
setDockingSupported(true);

// Forge provides #layout-left/right-dock-host, so it can render the
// "left/right rails span everything" mode. Gate the shared spanningDocks flag on
// this capability so the stock UI (no host divs) ignores it. Must run before the
// first LayoutProvider mount.
setRailSpanSupported(true);

// The built-in objectList panel is the shared "Kondycje" list now; forge just
// retitles it and defaults it to the "W poblizu" row-flavor. The stock header
// actions (flavor cycle + timers) stay ON so users can switch flavors. The
// default is process-local — the stock UI keeps titling it "Kondycje" and
// defaulting to the "Lista" flavor.
setObjectListChrome({ title: 'W poblizu', defaultViewMode: 'nearby' });

// Force layout mode on so the dock grid activates, keep the built-in
// objectList slot enabled (forge renders the forged "W poblizu" panel into it),
// and default to the vertical rail-span arrangement. NOTE: this persists to the
// SHARED `layoutManagerState` key — enabling layout mode in the stock UI too.
// spanningDocks is honoured only where setRailSpanSupported(true) ran, so the
// stock UI stays on its classic arrangement. Reversible from the layout UI.
const seed = loadLayoutState();
saveLayoutState({
    ...seed,
    enabled: true,
    enabledPanels: { objectList: true },
    spanningDocks: 'leftRight',
});

const client = createClient();

createRoot(document.getElementById('root')!).render(
    <ClientProvider value={client}>
        <App />
    </ClientProvider>,
);





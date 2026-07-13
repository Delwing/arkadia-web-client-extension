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
// SPIKE: adopt the shared dock/layout manager in forge. layout.css brings the
// dock grid + panel/floating chrome; layout-theme.css re-skins it forged.
import '@web/layout/layout.css';
import './layout-theme.css';
// Chaos-god theme variants (Mutanci Chaosu). chaos.css is scoped under
// html[data-god]; applyGod sets that attribute from ?god=/localStorage, so with
// no god selected the stock Forged look is untouched.
import './themes/chaos/chaos.css';
import './themes/chaos/applyGod';
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

// SPIKE: forge now renders real dock slots (via LayoutManagerWrapper), so
// docking IS supported here. Must run before the first popup component mounts
// (usePopup reads this synchronously).
setDockingSupported(true);

// SPIKE: forge provides #layout-left/right-dock-host, so it can render the
// "left/right rails span everything" mode. Gate the shared spanningDocks flag on
// this capability so the stock UI (no host divs) ignores it. Must run before the
// first LayoutProvider mount.
setRailSpanSupported(true);

// SPIKE: the built-in objectList slot renders forge's "W poblizu" panel, so
// retitle its header and drop the stock "Lista"/timers actions. Process-local —
// does not touch the shared state, so the stock UI keeps "Kondycje".
setObjectListChrome({ title: 'W poblizu', hideStockActions: true });

// SPIKE: force layout mode on so the dock grid activates, keep the built-in
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





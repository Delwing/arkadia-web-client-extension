/**
 * Forge UI — the "Forged" HUD (React).
 *
 * Builds the full game client (transport, triggers, rendering, input, vitals)
 * via the same stable contract the stock UI uses, then renders the HUD around it.
 * The client is provided through ClientContext; DOM-bound wiring (width measurer,
 * map mount, game-log append) runs inside component effects.
 *
 * Two pages boot it: the standalone `forge-ui/index.html` (via main.tsx) and the
 * main page when the forge shell is chosen (via src/web/shell/forgeShell.ts).
 * Importing this module loads forge's global stylesheets; nothing else runs
 * until {@link startForge}.
 */
import './style.css';
// Shared, var-driven popup body styles (see src/web/popups/popups.css).
import '@web/popups/popups.css';
import '@web-ui/messageFlair.css';
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
import { getRenderSettings, onRenderSettingsChange } from '@modules/core/settings';
import { setOutputTimestampVisibility } from '@shared/dom/outputMessageHandler';
import { setDockingSupported, setLayoutOverrides } from '@web/layout/utils/layoutStorage';
import { initDockArrangement } from '@web/layout/utils/dockArrangement';
import { setObjectListChrome } from '@web/layout/builtInChrome';
import { setPopoutEntry } from '@shared/dom/popoutWindows';
import { createClient } from './client/bootstrap';
import { ClientProvider } from './client/ClientContext';
import App from './components/App';

export interface StartForgeOptions {
    /** Where popped-out windows load from, when not the default `popup/index.html`. */
    popoutEntry?: string;
}

/** Configure the shared layout for forge, build the client and render the HUD into `root`. */
export function startForge(root: HTMLElement, options: StartForgeOptions = {}): void {
    // Forge renders real dock slots (via LayoutManagerWrapper), so
    // docking IS supported here. Must run before the first popup component mounts
    // (usePopup reads this synchronously).
    setDockingSupported(true);

    // The built-in objectList panel is the shared "Kondycje" list now; forge just
    // retitles it and defaults it to the "W poblizu" row-flavor. The stock header
    // actions (flavor cycle + timers) stay ON so users can switch flavors. The
    // default is process-local — the stock UI keeps titling it "Kondycje" and
    // defaulting to the "Lista" flavor.
    setObjectListChrome({ title: 'W poblizu', defaultViewMode: 'nearby' });

    // The popout entry lives at the deploy root. It mirrors the opener's styles, so
    // the same page serves both UIs; only the standalone forge page (served from
    // forge-ui/) has to point one level up.
    if (options.popoutEntry) setPopoutEntry(options.popoutEntry);

    // Force layout mode on so the dock grid activates and keep the built-in
    // objectList slot enabled (forge renders the forged "W poblizu" panel into it).
    // These are process-local OVERRIDES, not writes: forge and the stock UI share
    // one `layoutManagerState` key, so persisting them here would switch the stock
    // UI's "Menedzer Okien" on just because forge was opened once.
    // loadLayoutState() reports them as set for the rest of this page, and
    // saveLayoutState() keeps writing the user's own persisted values for those
    // fields. Must run before the first LayoutProvider mount / popup registration.
    setLayoutOverrides({
        enabled: true,
        enabledPanels: { objectList: true },
    });

    // Forge provides #layout-left/right-dock-host, so it renders both dock
    // arrangements; the player picks one in Ustawienia → Okna. Forge's own default
    // is the side rails spanning the full height. Applied as an override too, so
    // the choice never leaks into the stock shell's layout.
    initDockArrangement('forge', 'leftRight');

    // The output timestamp toggle persists (shared render setting, same key as the
    // stock UI); message-type visibility is session-only. Seed the shared engine's
    // timestamp visibility before the log mounts so the persisted choice applies on
    // load, and keep it in sync if the setting changes elsewhere. The right-click
    // output menu (see GameLog.tsx) drives both toggles at runtime.
    setOutputTimestampVisibility(getRenderSettings().showTimestamps);
    onRenderSettingsChange((render) => {
        setOutputTimestampVisibility(render.showTimestamps);
    });

    const client = createClient();

    createRoot(root).render(
        <ClientProvider value={client}>
            <App />
        </ClientProvider>,
    );
}

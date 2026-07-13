import type Client from '@client/Client';
import { globalStorage } from '@modules/core/storage';
import { defaultUiSettings } from '@web/defaultUiSettings';
import { bootstrapGameClient } from '@web/clientBootstrap';
import { installClientPorts } from '@web/installClientPorts';
import ObjectList from '@web/ObjectList';
import { getAttackController } from './attackController';
import { registerBuiltinFooterItems } from '@web-ui/footer/builtinItems';

/**
 * Build the game client for the Forged HUD.
 *
 * Uses the same shared bootstrap the stock UI does: `bootstrapGameClient` runs
 * every UI-agnostic startup concern (settings migrations, feature scripts,
 * session logging, Firebase sync, helper companion, and the sendCommand / NPC
 * bridges), so the HUD gets them for free. The one forge-ui-specific piece is the
 * port set injected here. We seed `uiSettings` first (the forge UI may run on a
 * profile the stock UI never touched); the returned helper connection is unused
 * by the HUD. The React tree consumes the client via ClientContext; DOM-bound
 * wiring (width measurer, map mount) runs later, in component effects.
 *
 * Ports are installed via the shared `installClientPorts`, the same seam the
 * stock UI uses — it wires BOTH the `UiPort` (herb/book tooltips + context menus)
 * and the `PluginHostPort` (default UI settings + the plugin-popup lifecycle).
 * Installing the plugin-host port is what lets plugin popups actually open here:
 * plugins register their popups through `PluginApi`, and `LayoutManagerWrapper`
 * renders them via `PluginPopupRenderer` — without the port those calls no-op.
 *
 * Herb/book tooltips reuse the framework-neutral `@shared/dom/tooltip` (via the
 * `@web` adapters) — they render into the `#hover-tooltip` element in index.html,
 * styled by forge-ui's own forged tooltip CSS. Context menus route to the shared
 * `contextMenuStore`: the book/output menu comes through the port, while the herb
 * menu writes to that store directly (via `@modules/core/contextMenus`), so
 * pointing the port at the same store lets one `<ContextMenu>` component render
 * all of them.
 */
export function createClient(): Client {
    if (!globalStorage.get('uiSettings')) {
        globalStorage.set('uiSettings', defaultUiSettings);
    }

    const { client } = bootstrapGameClient({ installPorts: installClientPorts });

    // Instantiate the attack controller once at boot (not lazily on first attack),
    // so the footer Atk chip's mode changes persist and drive team-attack behaviour
    // from the start, and the initial `attackMode` event reaches the chip.
    getAttackController(client);

    // Drive the built-in Kondycje (object list) panel. Forge renders it via the
    // shared `ObjectListPanel`, which only relocates the `#objects-list` node —
    // the class that actually consumes `gmcp.objects.*` and paints that node is
    // `ObjectList`. Stock instantiates it in main.ts; without it here the panel
    // stays empty (e.g. `/demo_kondycje` emits mock GMCP with no consumer).
    new ObjectList(client);

    // Put the built-in footer chips into the common registry; the registry then
    // applies the user's footer config (show/hide + order) before the HUD renders
    // them. The forge HUD is the UI that shows built-ins in the footer.
    registerBuiltinFooterItems();

    return client;
}

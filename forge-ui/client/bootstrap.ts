import type Client from '@client/Client';
import { globalStorage } from '@modules/core/storage';
import { setUiPort } from '@client/ports';
import { defaultUiSettings } from '@web/defaultUiSettings';
import { bootstrapGameClient } from '@web/clientBootstrap';
import { showHerbTooltip, hideHerbTooltip } from '@web/herbTooltip';
import { showBookTooltip, hideBookTooltip } from '@web/bookTooltip';
import { showContextMenu } from '@web/contextMenu';

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
 * Herb/book tooltips reuse the framework-neutral `@shared/dom/tooltip` (via the
 * `@web` adapters) — they render into the `#hover-tooltip` element in index.html,
 * styled by forge-ui's own forged tooltip CSS. Context menus route to the shared
 * `contextMenuStore`: the book menu comes through this port, while the herb menu
 * writes to that store directly (via `@modules/core/contextMenus`), so pointing
 * the port at the same store lets one `<ContextMenu>` component render both.
 */
export function createClient(): Client {
    if (!globalStorage.get('uiSettings')) {
        globalStorage.set('uiSettings', defaultUiSettings);
    }

    const { client } = bootstrapGameClient({
        installPorts: () => setUiPort({
            showHerbTooltip,
            hideHerbTooltip,
            showBookTooltip,
            hideBookTooltip,
            showContextMenu,
        }),
    });

    return client;
}

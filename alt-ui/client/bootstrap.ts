import mudClient from '@web/MudClient';
import Client from '@client/Client';
import { registerScripts } from '@client/main';
import { globalStorage } from '@modules/core/storage';
import { setUiPort } from '@client/ports';
import { defaultUiSettings } from '@web/defaultUiSettings';

/**
 * Build the game client for the Forged HUD.
 *
 * Same stable contract the stock UI uses: seed uiSettings defaults, inject the
 * (no-op) ports, construct the DOM-free Client, and register the feature
 * scripts. The React tree consumes this instance via ClientContext; DOM-bound
 * wiring (width measurer, map mount) runs later, in component effects.
 */
export function createClient(): Client {
    if (!globalStorage.get('uiSettings')) {
        globalStorage.set('uiSettings', defaultUiSettings);
    }

    setUiPort({
        showHerbTooltip() {},
        hideHerbTooltip() {},
        showBookTooltip() {},
        hideBookTooltip() {},
        showContextMenu(items) {
            console.log('[alt-ui] context menu requested:', items.map(i => i.label));
        },
    });

    const client = new Client(mudClient);
    registerScripts(client);
    return client;
}

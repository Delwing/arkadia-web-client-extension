/**
 * Wires the web UI's implementations into the client's injectable ports.
 *
 * The game client (`src/client`) never imports `src/web` directly; it depends
 * only on the port interfaces in `@client/ports`. This module is the single
 * place where the web UI supplies the concrete behaviour. Call `installClientPorts()`
 * once at bootstrap, before `registerScripts(client)`.
 */
import { setUiPort, setPluginHostPort } from '@client/ports';
import { showHerbTooltip, hideHerbTooltip } from './herbTooltip';
import { showBookTooltip, hideBookTooltip } from './bookTooltip';
import { showContextMenu } from './contextMenu';
import { defaultUiSettings } from './defaultUiSettings';
import { shouldPopupAutoOpen, getPopupPinnedState } from './layout/utils/layoutStorage';
import {
    registerPluginPopup,
    unregisterPluginPopup,
    updatePluginPopup,
    openPluginPopup,
    closePluginPopup,
    getPluginPopup,
} from './layout/pluginPopupRegistry';

export function installClientPorts(): void {
    setUiPort({
        showHerbTooltip,
        hideHerbTooltip,
        showBookTooltip,
        hideBookTooltip,
        showContextMenu,
    });

    setPluginHostPort({
        getDefaultUiSettings: () => defaultUiSettings,
        shouldPopupAutoOpen,
        getPopupPinnedState,
        registerPluginPopup,
        unregisterPluginPopup,
        updatePluginPopup,
        openPluginPopup,
        closePluginPopup,
        getPluginPopup,
    });
}

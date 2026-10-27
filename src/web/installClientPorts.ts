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
import { attachTooltip } from '@shared/dom/tooltip.ts';
import { attachScrollback } from '@shared/dom/scrollback.ts';
import { isAnyModalOpen } from './modals/appModal';
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
import { getWindowSetting, setWindowSetting, subscribeToWindowSetting } from './layout/windowSettings';
import { getPluginUiKit, publishPluginUiKit } from './pluginUiKit';
import { readPluginSqlite } from './pluginSqlite';

export function installClientPorts(): void {
    publishPluginUiKit();

    setUiPort({
        showHerbTooltip,
        hideHerbTooltip,
        showBookTooltip,
        hideBookTooltip,
        showContextMenu,
        attachTooltip,
        attachScrollback,
        // Suppress global (direction) keybinds while a page-level window is open.
        shouldSuppressKeys: () => isAnyModalOpen(),
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
        getUiKit: getPluginUiKit,
        getWindowSetting,
        setWindowSetting,
        subscribeToWindowSetting,
        readSqlite: readPluginSqlite,
    });
}

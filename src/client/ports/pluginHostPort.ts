import type { UiSettings } from '@shared/uiSettingsTypes';
import type { PluginPopupConfig } from '@web/layout/pluginPopupRegistry';

// Re-export so PluginApi and other client code reference these types through
// the port rather than importing `@web` directly. The type definitions
// themselves still live under `@web` for now; relocating them to a neutral
// layer is a follow-up (see the storageSchema type-edge cleanup).
export type { UiSettings, PluginPopupConfig };

/**
 * Plugin-host port: web-UI-specific capabilities that the plugin API needs but
 * that are owned by the surrounding UI — the default UI settings shape and the
 * plugin-popup lifecycle.
 *
 * The client core calls `getPluginHostPort()`; the UI injects a real
 * implementation at bootstrap via `setPluginHostPort()`. The default is a
 * no-op/empty implementation so the client runs without a UI host.
 */
export interface PluginHostPort {
    /** Default UI settings, merged under any stored overrides by the plugin API. */
    getDefaultUiSettings(): UiSettings;

    shouldPopupAutoOpen(popupId: string): boolean;
    getPopupPinnedState(popupId: string): boolean;

    registerPluginPopup(config: PluginPopupConfig): void;
    unregisterPluginPopup(popupId: string): void;
    updatePluginPopup(popupId: string, updates: Partial<PluginPopupConfig>): void;
    openPluginPopup(popupId: string): Promise<void>;
    closePluginPopup(popupId: string): void;
    getPluginPopup(popupId: string): PluginPopupConfig | undefined;
}

const noopPluginHostPort: PluginHostPort = {
    // No UI host installed: no known defaults. The plugin API spreads this under
    // stored settings, so an empty object simply means "only stored values".
    getDefaultUiSettings: () => ({} as UiSettings),
    shouldPopupAutoOpen: () => false,
    getPopupPinnedState: () => false,
    registerPluginPopup: () => {},
    unregisterPluginPopup: () => {},
    updatePluginPopup: () => {},
    openPluginPopup: () => Promise.resolve(),
    closePluginPopup: () => {},
    getPluginPopup: () => undefined,
};

let current: PluginHostPort = noopPluginHostPort;

/** Install the UI host implementation of the port. Called once by the UI at bootstrap. */
export function setPluginHostPort(port: PluginHostPort): void {
    current = port;
}

/** Access the currently installed plugin-host port (a no-op implementation until set). */
export function getPluginHostPort(): PluginHostPort {
    return current;
}

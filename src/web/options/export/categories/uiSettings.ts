import eventBus from '@modules/core/eventBus';
import { globalStorage } from '@modules/core/storage';
import type { CategoryHandler } from "../categoryHandler";

/**
 * Device-scoped settings bundle: interface settings + layout + widgets + trip
 * routes + keymap. Button settings have their own categories (buttons /
 * radial), so they are intentionally not bundled here.
 */
export interface ExportedUiSettings {
    uiSettings?: string;
    loggingEnabled?: string;
    layoutManagerState?: string;
    tripRoutes?: string;
    widgetLayout?: string;
    activeKeymap?: string;
}

/**
 * Migrate an imported layoutManagerState blob (v8: nested-slots -> flat-windows).
 * The transform lives in @web/layout and is imported lazily so this module stays
 * independent of the layout bundle, matching settingsMigrations.migrateLayoutManagerState.
 */
async function migrateImportedLayoutState(raw: string): Promise<string> {
    try {
        const parsed = JSON.parse(raw);
        // Already in the new flat-windows shape — nothing to do.
        if (parsed && typeof parsed === 'object' && 'windows' in parsed) {
            return raw;
        }
        const { migrateLayoutState } = await import('@web/layout/utils/layoutStorage');
        return JSON.stringify(migrateLayoutState(parsed));
    } catch {
        return raw;
    }
}

export const uiSettingsCategory: CategoryHandler = {
    export() {
        const data: ExportedUiSettings = {};
        const uiSettings = localStorage.getItem('uiSettings');
        if (uiSettings) data.uiSettings = uiSettings;
        const loggingEnabled = localStorage.getItem('loggingEnabled');
        if (loggingEnabled) data.loggingEnabled = loggingEnabled;
        const layoutManagerState = localStorage.getItem('layoutManagerState');
        if (layoutManagerState) data.layoutManagerState = layoutManagerState;
        const tripRoutes = localStorage.getItem('tripRoutes');
        if (tripRoutes) data.tripRoutes = tripRoutes;
        const widgetLayout = localStorage.getItem('widgetLayout');
        if (widgetLayout) data.widgetLayout = widgetLayout;
        // Canonical active keymap lives under 'active_keymap_id'
        // (arkadia.activeKeymap is a legacy key migrated away at startup).
        const activeKeymap = globalStorage.get('active_keymap_id');
        if (activeKeymap) data.activeKeymap = activeKeymap;
        return Object.keys(data).length > 0 ? JSON.stringify(data) : null;
    },

    async import(data, { storage, skipDeviceScoped: skipDevice }) {
        // Older payloads may still carry desktop/mobile button fields; those
        // come from the buttons / radial categories and are ignored here.
        if (data.uiSettings && !skipDevice) storage.setItem('uiSettings', data.uiSettings);
        if (data.loggingEnabled) storage.setItem('loggingEnabled', data.loggingEnabled);
        if (data.layoutManagerState && !skipDevice) {
            // Imported data skips the startup migration pass, so migrate a
            // pre-v8 nested-slots layout to the flat-windows shape here.
            storage.setItem('layoutManagerState', await migrateImportedLayoutState(data.layoutManagerState));
        }
        if (data.tripRoutes && !skipDevice) storage.setItem('tripRoutes', data.tripRoutes);
        if (data.widgetLayout && !skipDevice) storage.setItem('widgetLayout', data.widgetLayout);
        if (data.activeKeymap && !skipDevice) {
            // Persist the canonical key so the selection survives even if
            // the keymap itself isn't loaded yet (e.g. binds imported later).
            const activeKeymap = data.activeKeymap as string;
            globalStorage.set('active_keymap_id', activeKeymap);
            // Re-apply the selected keymap's binds to the flat 'binds' key
            import('@modules/core/keymapStorage').then(({ switchKeymap }) => {
                switchKeymap(activeKeymap);
            }).catch(() => {
                // keymapStorage may not be available in all contexts
            });
        }
        // Notify layout system of changes
        if (data.layoutManagerState && !skipDevice) {
            eventBus.emit('layoutManagerStateChanged', { type: 'import' });
        }
    },
};

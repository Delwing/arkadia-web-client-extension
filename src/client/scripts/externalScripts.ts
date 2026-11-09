import Client from "../Client";
import {PluginManager} from "../PluginManager";
import {getAllStoredPluginIds} from "../utils/pluginStorage";
import {globalStorage} from "@modules/core/storage";
import { getHostPort } from "../ports";

const STORAGE_KEY = "scripts";
const STORED_SCRIPTS_KEY = "stored_scripts";

export default function initExternalScripts(client: Client) {
    // Create PluginManager instance
    const pluginManager = new PluginManager(client);

    let known: string[] = [];
    let knownStored: string[] = [];

    const apply = async (urlList: string[] = [], storedList: string[] = []) => {
        // Combine both URL-based and stored plugins
        const allPlugins = [...urlList, ...storedList];

        // Get currently loaded plugins
        const currentlyLoaded = pluginManager.getLoadedPlugins().map(p => p.url);

        // Unload plugins that are no longer in the list
        const toUnload = currentlyLoaded.filter(id => !allPlugins.includes(id));
        await Promise.all(toUnload.map(id => pluginManager.unloadPlugin(id)));

        // Load new plugins (both URLs and stored)
        const toLoad = allPlugins.filter(id => !pluginManager.isLoaded(id));
        await Promise.all(toLoad.map(id => pluginManager.loadPlugin(id)));
    };

    // Load stored plugins from IndexedDB on initialization
    const loadStoredPluginsFromDB = async () => {
        try {
            knownStored = await getAllStoredPluginIds();
            apply(known, knownStored);
        } catch (error) {
            console.error("Failed to load stored plugins from IndexedDB:", error);
        }
    };

    const host = getHostPort();
    const param = host.getLaunchParam("add-script");
    let handled = false;

    const checkParam = () => {
        if (handled || !param) return;
        handled = true;
        if (!known.includes(param)) {
            known.push(param);
            globalStorage.set(STORAGE_KEY, known);
            apply(known, knownStored);
        }
        host.clearLaunchParam("add-script");
    };

    // Load initial scripts from storage
    const initialScripts = globalStorage.get(STORAGE_KEY);
    if (initialScripts) {
        known = Array.isArray(initialScripts) ? initialScripts : [];
        apply(known, knownStored);
    }

    globalStorage.onChange(STORAGE_KEY, (newValue) => {
        known = Array.isArray(newValue) ? newValue : [];
        apply(known, knownStored);
    });

    globalStorage.onChange(STORED_SCRIPTS_KEY, () => {
        loadStoredPluginsFromDB();
    });

    checkParam();

    // Load stored plugins from IndexedDB on initialization
    loadStoredPluginsFromDB();

    // Listen for storage events from other windows (like the editor)
    host.onStorageChange('stored_scripts_updated', () => {
        loadStoredPluginsFromDB();
    });

    // Return plugin manager for access by other modules
    return pluginManager;
}

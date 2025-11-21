import Client from "../Client";
import { PluginManager } from "../PluginManager";
import { getAllStoredPluginIds } from "../utils/pluginStorage";

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
            const ids = await getAllStoredPluginIds();
            knownStored = ids;
            apply(known, knownStored);
        } catch (error) {
            console.error("Failed to load stored plugins from IndexedDB:", error);
        }
    };

    const param = new URLSearchParams(window.location.search).get("add-script");
    let handled = false;

    const checkParam = () => {
        if (handled || !param) return;
        handled = true;
        if (!known.includes(param)) {
            known.push(param);
            client.port?.postMessage({
                type: "SET_STORAGE",
                key: STORAGE_KEY,
                value: known,
            });
            apply(known, knownStored);
        }
        const params = new URLSearchParams(window.location.search);
        params.delete("add-script");
        const base = window.location.origin + window.location.pathname;
        const rest = params.toString();
        window.location.replace(rest ? `${base}?${rest}` : base);
    };

    client.on("storage", ({ key, value }) => {
        if (key === STORAGE_KEY) {
            known = Array.isArray(value) ? value : [];
            apply(known, knownStored);
        } else if (key === STORED_SCRIPTS_KEY) {
            // Reload from IndexedDB when stored_scripts changes
            loadStoredPluginsFromDB();
        }
    });

    client.on("port-connected", () => {
        checkParam();
    })

    // Load stored plugins from IndexedDB on initialization
    loadStoredPluginsFromDB();

    // Listen for storage events from other windows (like the editor)
    window.addEventListener('storage', (e) => {
        if (e.key === 'stored_scripts_updated') {
            loadStoredPluginsFromDB();
        }
    });

    // Return plugin manager for access by other modules
    return pluginManager;
}

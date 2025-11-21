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
            knownStored = Array.isArray(value) ? value : [];
            apply(known, knownStored);
        }
    });

    client.on("port-connected", () => {
        checkParam();
    })

    // Return plugin manager for access by other modules
    return pluginManager;
}

import Client from "../Client";
import { PluginManager } from "../PluginManager";

const STORAGE_KEY = "scripts";

export default function initExternalScripts(client: Client) {
    // Create PluginManager instance
    const pluginManager = new PluginManager(client);

    let known: string[] = [];

    const apply = async (list: string[] = []) => {
        // Get currently loaded plugins
        const currentlyLoaded = pluginManager.getLoadedPlugins().map(p => p.url);

        // Unload plugins that are no longer in the list
        const toUnload = currentlyLoaded.filter(url => !list.includes(url));
        await Promise.all(toUnload.map(url => pluginManager.unloadPlugin(url)));

        // Load new plugins
        const toLoad = list.filter(url => !pluginManager.isLoaded(url));
        await Promise.all(toLoad.map(url => pluginManager.loadPlugin(url)));
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
            apply(known);
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
            apply(known);
        }
    });

    client.on("port-connected", () => {
        checkParam();
    })

    // Return plugin manager for access by other modules
    return pluginManager;
}

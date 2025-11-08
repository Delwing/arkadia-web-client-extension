import Client from "../Client";
import { PluginManager } from "../PluginManager";
import { BUILTIN_PLUGIN_ID_SET } from "@shared/constants/builtinPlugins";

const STORAGE_KEY = "scripts";
const BUILTIN_STORAGE_KEY = "builtinScripts";

export default function initExternalScripts(client: Client) {
    // Create PluginManager instance
    const pluginManager = new PluginManager(client);

    let known: string[] = [];
    let enabledBuiltins: string[] = [];

    const apply = async (list: string[] = []) => {
        // Get currently loaded external plugins
        const currentlyLoaded = pluginManager
            .getLoadedPlugins()
            .filter(plugin => plugin.origin !== "builtin")
            .map(p => p.url);

        // Unload plugins that are no longer in the list
        const toUnload = currentlyLoaded.filter(url => !list.includes(url));
        await Promise.all(toUnload.map(url => pluginManager.unloadPlugin(url)));

        // Load new plugins
        const toLoad = list.filter(url => !pluginManager.isLoaded(url));
        await Promise.all(toLoad.map(url => pluginManager.loadPlugin(url)));
    };

    const applyBuiltins = async (list: string[] = []) => {
        const validIds = list.filter(id => BUILTIN_PLUGIN_ID_SET.has(id));

        const loadedBuiltinIds = pluginManager
            .getLoadedPlugins()
            .filter(plugin => plugin.origin === "builtin" && BUILTIN_PLUGIN_ID_SET.has(plugin.url))
            .map(plugin => plugin.url);

        const toUnload = loadedBuiltinIds.filter(id => !validIds.includes(id));
        await Promise.all(toUnload.map(id => pluginManager.unloadPlugin(id)));

        const toLoad = validIds.filter(id => !pluginManager.isLoaded(id));
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

        if (key === BUILTIN_STORAGE_KEY) {
            enabledBuiltins = Array.isArray(value)
                ? value.filter((id: unknown): id is string => typeof id === "string" && BUILTIN_PLUGIN_ID_SET.has(id))
                : [];
            applyBuiltins(enabledBuiltins);
        }
    });

    client.on("port-connected", () => {
        checkParam();
        applyBuiltins(enabledBuiltins);
    })

    // Return plugin manager for access by other modules
    return pluginManager;
}

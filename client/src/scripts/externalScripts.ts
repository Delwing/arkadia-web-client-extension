import Client from "../Client";
import PluginHost from "../plugins/PluginHost";
import type { PluginHostOptions } from "../plugins/api";

const STORAGE_KEY = "scripts";

export default function initExternalScripts(client: Client, options: PluginHostOptions = {}) {
    const host = new PluginHost(client, options);

    const loaded = new Set<string>();
    let known: string[] = [];

    const apply = (list: string[] = []) => {
        Array.from(loaded).forEach(url => {
            if (!list.includes(url)) {
                host.dispose(url).catch(err => console.error(`Failed to dispose plugin for ${url}`, err));
                loaded.delete(url);
            }
        });
        list.forEach(url => {
            if (loaded.has(url)) {
                return;
            }
            loaded.add(url);
            host.load(url).catch(err => {
                console.error(`Failed to load plugin for ${url}`, err);
                host.dispose(url).catch(disposeErr => console.error(`Failed to dispose plugin for ${url}`, disposeErr));
                loaded.delete(url);
            });
        });
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

    client.addEventListener("storage", (ev: CustomEvent) => {
        if (ev.detail.key === STORAGE_KEY) {
            known = Array.isArray(ev.detail.value) ? ev.detail.value : [];
            apply(known);
        }
    });

    client.addEventListener("port-connected", () => {
        checkParam();
    })
}

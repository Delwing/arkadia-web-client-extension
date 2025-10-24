import Client from "../Client";
import PluginHost from "../plugins/PluginHost";
import type { PluginHostOptions } from "../plugins/api";

const STORAGE_KEY = "scripts";

export default function initExternalScripts(client: Client, options: PluginHostOptions = {}) {
    const host = new PluginHost(client, options);
    host.attachToWindow();

    const loaded: Record<string, HTMLScriptElement> = {};
    let known: string[] = [];

    const apply = (list: string[] = []) => {
        Object.keys(loaded).forEach(url => {
            if (!list.includes(url)) {
                host.dispose(url).catch(err => console.error(`Failed to dispose plugin for ${url}`, err));
                loaded[url].remove();
                delete loaded[url];
            }
        });
        list.forEach(url => {
            if (!loaded[url]) {
                const script = document.createElement("script");
                script.src = url;
                script.async = true;
                script.dataset.arkadiaPluginUrl = url;
                script.addEventListener("error", () => {
                    host.dispose(url).catch(err => console.error(`Failed to dispose plugin for ${url}`, err));
                    delete loaded[url];
                });
                document.head.appendChild(script);
                loaded[url] = script;
            }
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

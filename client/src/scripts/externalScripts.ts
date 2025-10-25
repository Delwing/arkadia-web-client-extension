import Client from "../Client";
import { getClientStore } from "../state/scriptStore";

const STORAGE_KEY = "scripts";

export default function initExternalScripts(client: Client) {
    const store = getClientStore(client);
    const loaded: Record<string, HTMLScriptElement> = {};
    let known: string[] = [];

    const apply = (list: string[] = []) => {
        Object.keys(loaded).forEach(url => {
            if (!list.includes(url)) {
                loaded[url].remove();
                delete loaded[url];
            }
        });
        list.forEach(url => {
            if (!loaded[url]) {
                const script = document.createElement("script");
                script.src = url;
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
            void store.setStorageItem(STORAGE_KEY, structuredClone(known));
            apply(known);
        }
        const params = new URLSearchParams(window.location.search);
        params.delete("add-script");
        const base = window.location.origin + window.location.pathname;
        const rest = params.toString();
        window.location.replace(rest ? `${base}?${rest}` : base);
    };

    store.subscribeStorage<string[]>(STORAGE_KEY, (value) => {
        known = Array.isArray(value) ? value : [];
        apply(known);
    });

    void (async () => {
        const stored = await store.getStorageItem<string[]>(STORAGE_KEY);
        if (Array.isArray(stored)) {
            known = stored;
            apply(known);
        }
        checkParam();
    })();
}

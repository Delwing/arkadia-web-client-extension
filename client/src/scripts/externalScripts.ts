import Client from "../Client";

const STORAGE_KEY = "scripts";

export default function initExternalScripts(client: Client) {
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
}

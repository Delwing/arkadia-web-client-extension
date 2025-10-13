import {getItemSync, setItemSync} from "../storage";

const STORAGE_KEY = "scripts";

export default function initExternalScripts() {
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
            setItemSync(STORAGE_KEY, known);
            apply(known);
        }
        const params = new URLSearchParams(window.location.search);
        params.delete("add-script");
        const base = window.location.origin + window.location.pathname;
        const rest = params.toString();
        window.location.replace(rest ? `${base}?${rest}` : base);
    };

    const scripts = getItemSync(STORAGE_KEY) || []
    apply(scripts.scripts);

    window.addEventListener("load", checkParam);
}

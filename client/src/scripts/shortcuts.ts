import Client from "../Client";

export interface Shortcut {
    name: string;
    loc: number;
}

const STORAGE_KEY = "shortcuts";

export default function initShortcuts(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const list = aliases || client.aliases;
    let shortcuts: Record<string, number> = {};

    const apply = (arr: Shortcut[] = []) => {
        shortcuts = {};
        arr.forEach(s => {
            if (s && s.name && typeof s.loc === 'number') {
                shortcuts[s.name.toLowerCase()] = s.loc;
            }
        });
    };

    client.addEventListener('storage', (ev: CustomEvent) => {
        if (ev.detail.key === STORAGE_KEY) {
            apply(Array.isArray(ev.detail.value) ? ev.detail.value : []);
        }
    });

    client.addEventListener('port-connected', () => {
        client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
    });

    client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });

    list.push({
        pattern: /\/prowadz (.+)$/,
        callback: (m: RegExpMatchArray) => {
            const arg = m[1].trim();
            const loc = shortcuts[arg.toLowerCase()];
            const num = parseInt(arg);
            if (loc) {
                client.sendEvent('leadTo', loc);
            } else if (!isNaN(num)) {
                client.sendEvent('leadTo', num);
            } else {
                client.sendEvent('leadTo', arg);
            }
        }
    });
}

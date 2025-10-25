import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";
import { getClientStore } from "../state/scriptStore";

export interface ShortcutEntry {
    key: string;
    id: number;
    label: string;
}

const STORAGE_KEY = "shortcuts";

const shortcuts: Record<string, ShortcutEntry> = {};

export function getShortcut(id: string): number | undefined {
    return shortcuts[id]?.id;
}

export default function initShortcuts(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const store = getClientStore(client);
    const HEADER_COLOR = findClosestColor("#7cfc00");
    const NAME_COLOR = findClosestColor("#ffa500");

    function apply(list: ShortcutEntry[] = []) {
        Object.keys(shortcuts).forEach(k => delete shortcuts[k]);
        list.forEach(s => {
            if (s && s.key) {
                shortcuts[s.key] = { key: s.key, id: s.id, label: s.label };
            }
        });
    }

    function persist() {
        void store.setStorageItem(STORAGE_KEY, Object.values(shortcuts).map(sc => ({ ...sc })));
    }

    store.subscribeStorage<ShortcutEntry[]>(STORAGE_KEY, (value) => {
        const list = Array.isArray(value) ? value : [];
        apply(list);
    });

    void (async () => {
        const stored = await store.getStorageItem<ShortcutEntry[]>(STORAGE_KEY);
        if (Array.isArray(stored)) {
            apply(stored);
        }
    })();

    function printShortcuts() {
        const lines: string[] = [];
        Object.values(shortcuts).forEach(sc => {
            const lead = client.OutputHandler.makeClickable("prowadz", "prowadz " + sc.key, () => {
                client.sendCommand("/prowadz " + sc.key);
            });
            lines.push(`${colorString(sc.key, HEADER_COLOR)} → ${sc.id} ${colorString(sc.label, NAME_COLOR)} [ ${lead} ]`);
        });
        client.println(lines.length ? lines.join("\n") : "Brak skrotow.");
    }

    function add(id: number, key: string, label: string = '') {
        shortcuts[key] = { key, id, label };
        persist();
    }

    function remove(key: string) {
        if (shortcuts[key]) {
            delete shortcuts[key];
            persist();
        }
    }

    function clear() {
        Object.keys(shortcuts).forEach(k => delete shortcuts[k]);
        persist();
    }

    if (aliases) {
        aliases.push({ pattern: /^\/pokaz_skroty$/, callback: printShortcuts });
        aliases.push({ pattern: /^\/dodaj_skrot ([0-9]+) ([a-zA-Z_0-9]+)(?:\s+(.*))?$/, callback: (m: RegExpMatchArray) => add(parseInt(m[1]), m[2], m[3] ?? '') });
        aliases.push({ pattern: /^\/usun_skrot ([a-zA-Z_]+)$/, callback: (m: RegExpMatchArray) => remove(m[1]) });
        aliases.push({ pattern: /^\/usun_skroty$/, callback: clear });
    }
}

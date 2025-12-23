import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import eventBus from "@modules/core/eventBus";

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
    const HEADER_COLOR = createColorFormat("#7cfc00");
    const NAME_COLOR = createColorFormat("#ffa500");

    function apply(list: ShortcutEntry[] = []) {
        Object.keys(shortcuts).forEach(k => delete shortcuts[k]);
        list.forEach(s => {
            if (s && s.key) {
                shortcuts[s.key] = { key: s.key, id: s.id, label: s.label };
            }
        });
    }

    function persist() {
        client.port?.postMessage({ type: "SET_STORAGE", key: STORAGE_KEY, value: Object.values(shortcuts) });
    }

    client.on("storage", ({ key, value }) => {
        if (key === STORAGE_KEY) {
            const valueArray = Array.isArray(value) ? value : [];
            apply(valueArray);
        }
    });

    client.on("port-connected", () => {
        client.port?.postMessage({ type: "GET_STORAGE", key: STORAGE_KEY });
    });

    client.port?.postMessage({ type: "GET_STORAGE", key: STORAGE_KEY });

    function printShortcuts() {
        const entries = Object.values(shortcuts);
        if (!entries.length) {
            client.println("Brak skrotow.");
            return;
        }

        // Find the maximum key length for alignment
        const maxKeyLength = Math.max(...entries.map(sc => sc.key.length));

        const output = new AnsiAwareBuffer();
        entries.forEach((sc, idx) => {
            if (idx > 0) {
                output.append('\n');
            }

            // Build the line with padding for alignment
            output.appendBuffer(colorString(sc.key, HEADER_COLOR));
            const padding = ' '.repeat(maxKeyLength - sc.key.length);
            output.append(`${padding} → ${sc.id} `, {});
            output.appendBuffer(colorString(sc.label, NAME_COLOR));
            output.append(' [ ', {});

            const leadStart = output.length;
            output.append('prowadz', {});
            output.createLink([leadStart, leadStart + 'prowadz'.length], {
                onClick: () => {
                    client.sendCommand("/prowadz " + sc.key);
                },
                title: `Kliknij aby prowadzić do: ${sc.key}`
            });

            output.append(' ]', {});
        });

        client.println(output);
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
        aliases.push({ pattern: /^\/skroty_popup$/, callback: () => eventBus.emit('skroty.popup.open') });
    }
}

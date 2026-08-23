import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import { globalStorage } from "@modules/core/storage";

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
        globalStorage.set(STORAGE_KEY, Object.values(shortcuts) as any);
    }

    // The shortcuts live in globalStorage and outlive the script; the lookup table
    // must not, or a stopped script keeps answering getShortcut.
    client.scope.onDispose(() => {
        Object.keys(shortcuts).forEach(k => delete shortcuts[k]);
    });

    const initialShortcuts = globalStorage.get(STORAGE_KEY);
    if (initialShortcuts) {
        const arr = Array.isArray(initialShortcuts) ? initialShortcuts : Object.values(initialShortcuts);
        apply(arr);
    }

    client.scope.onDispose(globalStorage.onChange(STORAGE_KEY, (newValue) => {
        const arr = newValue ? (Array.isArray(newValue) ? newValue : Object.values(newValue)) : [];
        apply(arr);
    }));

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
        // Support both quoted and unquoted names: /dodaj_skrot 123 "nazwa ze spacjami" opis OR /dodaj_skrot 123 nazwa opis
        aliases.push({ pattern: /^\/dodaj_skrot ([0-9]+) "([^"]+)"(?:\s+(.*))?$/, callback: (m: RegExpMatchArray) => add(parseInt(m[1]), m[2], m[3] ?? '') });
        aliases.push({ pattern: /^\/dodaj_skrot ([0-9]+) ([a-zA-Z_0-9]+)(?:\s+(.*))?$/, callback: (m: RegExpMatchArray) => add(parseInt(m[1]), m[2], m[3] ?? '') });
        // Support both quoted and unquoted names: /usun_skrot "nazwa ze spacjami" OR /usun_skrot nazwa
        aliases.push({ pattern: /^\/usun_skrot "([^"]+)"$/, callback: (m: RegExpMatchArray) => remove(m[1]) });
        aliases.push({ pattern: /^\/usun_skrot ([a-zA-Z_0-9]+)$/, callback: (m: RegExpMatchArray) => remove(m[1]) });
        aliases.push({ pattern: /^\/usun_skroty$/, callback: clear });
        aliases.push({ pattern: /^\/skrotyw$/, callback: () => eventBus.emit('skroty.popup.open') });
    }
}

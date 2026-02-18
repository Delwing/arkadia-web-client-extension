import Client from "../Client";
import { getCurrentCharacter } from "@modules/core/storage";

export interface UserAlias {
    pattern: string;
    command: string;
    overrides?: Record<string, string>;
}

const STORAGE_KEY = "aliases";

export default function initUserAliases(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const list = aliases || client.aliases;
    let mapped: { pattern: RegExp; callback: (matches: RegExpMatchArray) => Promise<void> }[] = [];

    const apply = (arr: UserAlias[] = []) => {
        mapped.forEach(a => {
            const idx = list.indexOf(a);
            if (idx !== -1) list.splice(idx, 1);
        });
        mapped = arr.map(item => {
            let regexp: RegExp;
            try {
                regexp = new RegExp('^' + item.pattern + '$');
            } catch (err) {
                console.error('Invalid alias pattern', item.pattern, err);
                return null;
            }
            return {
                pattern: regexp,
                callback: (m: RegExpMatchArray) => {
                    const char = getCurrentCharacter();
                    const baseCmd = (char && item.overrides?.[char]) || item.command;
                    const cmd = baseCmd.replace(/\$(\d+)/g, (_, n) => m[parseInt(n)] ?? '');
                    return client.sendCommand(cmd);
                }
            };
        }).filter((v): v is { pattern: RegExp; callback: (matches: RegExpMatchArray) => Promise<void> } => v !== null);
        mapped.forEach(a => list.push(a));
    };

    client.on('storage', ({ key, value }) => {
        if (key === STORAGE_KEY) {
            const valueArray = Array.isArray(value) ? value : [];
            apply(valueArray);
        }
    });

    client.on('port-connected', () => {
        client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
    });

    client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
}

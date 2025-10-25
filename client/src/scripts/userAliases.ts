import Client from "../Client";
import { getClientStore } from "../state/scriptStore";

export interface UserAlias {
    pattern: string;
    command: string;
}

const STORAGE_KEY = "aliases";

export default function initUserAliases(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const store = getClientStore(client);
    const list = aliases || client.aliases;
    let mapped: { pattern: RegExp; callback: (matches: RegExpMatchArray) => void }[] = [];

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
                    const cmd = item.command.replace(/\$(\d+)/g, (_, n) => m[parseInt(n)] ?? '');
                    client.sendCommand(cmd);
                }
            };
        }).filter((v): v is { pattern: RegExp; callback: (matches: RegExpMatchArray) => void } => v !== null);
        mapped.forEach(a => list.push(a));
    };

    store.subscribeStorage<UserAlias[]>(STORAGE_KEY, (value) => {
        apply(Array.isArray(value) ? value : []);
    });

    void (async () => {
        const stored = await store.getStorageItem<UserAlias[]>(STORAGE_KEY);
        if (Array.isArray(stored)) {
            apply(stored);
        }
    })();
}

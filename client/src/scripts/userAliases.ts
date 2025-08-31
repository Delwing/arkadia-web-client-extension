import Client from "../Client";

export interface UserAlias {
    pattern: string;
    command: string;
}

const STORAGE_KEY = "aliases";

export default function initUserAliases(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
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
                    const input = m.input ?? '';
                    const words = input.trim().split(/\s+/).filter(Boolean);
                    const cmd = item.command
                        .replace(/%%/g, input)
                        .replace(/%(-?\d+)/g, (_, n) => {
                            const idx = parseInt(n, 10);
                            if (idx >= 0) {
                                return words[idx] ?? '';
                            }
                            return words.slice(-idx).join(' ');
                        })
                        .replace(/\$(\d+)/g, (_, n) => m[parseInt(n)] ?? '');
                    client.sendCommand(cmd);
                }
            };
        }).filter((v): v is { pattern: RegExp; callback: (matches: RegExpMatchArray) => void } => v !== null);
        mapped.forEach(a => list.push(a));
    };

    client.addEventListener('storage', (ev: CustomEvent) => {
        if (ev.detail.key === STORAGE_KEY) {
            const value = Array.isArray(ev.detail.value) ? ev.detail.value : [];
            apply(value);
        }
    });

    client.addEventListener('port-connected', () => {
        client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
    });

    client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
}

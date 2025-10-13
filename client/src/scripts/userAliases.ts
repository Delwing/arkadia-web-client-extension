import Client from "../Client";
import {getItemSync} from "../storage";

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
                    const cmd = item.command.replace(/\$(\d+)/g, (_, n) => m[parseInt(n)] ?? '');
                    client.sendCommand(cmd);
                }
            };
        }).filter((v): v is { pattern: RegExp; callback: (matches: RegExpMatchArray) => void } => v !== null);
        mapped.forEach(a => list.push(a));
    };

    apply(getItemSync(STORAGE_KEY) || []);
}

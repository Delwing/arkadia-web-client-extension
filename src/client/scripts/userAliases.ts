import Client from "../Client";
import { characterStorage, globalStorage } from "@modules/core/storage";

export interface UserAlias {
    pattern: string;
    command: string;
    overrides?: Record<string, string>;
}

const STORAGE_KEY = "aliases";
const MAX_RANGE = 50;
const RANGE_PATTERN = /^(\d+)(?:-(\d+))?$/;

function findRange(m: RegExpMatchArray): { start: number; end: number } | null {
    for (let i = 1; i < m.length; i++) {
        if (!m[i]) continue;
        const rm = m[i].match(RANGE_PATTERN);
        if (rm) {
            const start = parseInt(rm[1]);
            const end = rm[2] !== undefined ? parseInt(rm[2]) : start;
            return { start, end };
        }
    }
    return null;
}

function expandRange(start: number, end: number): number[] {
    const step = start <= end ? 1 : -1;
    const count = Math.abs(end - start) + 1;
    const capped = Math.min(count, MAX_RANGE);
    const result: number[] = [];
    for (let i = 0; i < capped; i++) {
        result.push(start + i * step);
    }
    return result;
}

function substituteGroups(cmd: string, m: RegExpMatchArray): string {
    return cmd.replace(/\$(\d+)/g, (_, n) => m[parseInt(n)] ?? '');
}

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
                callback: async (m: RegExpMatchArray) => {
                    const char = characterStorage.getCharacter();
                    const baseCmd = (char && item.overrides?.[char]) || item.command;
                    const normalized = baseCmd.replace(/\n/g, ';');

                    if (normalized.includes('$i')) {
                        const range = findRange(m);
                        if (range) {
                            const values = expandRange(range.start, range.end);
                            for (const val of values) {
                                const cmd = substituteGroups(normalized, m).replace(/\$i/g, String(val));
                                await client.sendCommand(cmd);
                            }
                            return;
                        }
                    }

                    const cmd = substituteGroups(normalized, m);
                    return client.sendCommand(cmd);
                }
            };
        }).filter((v): v is { pattern: RegExp; callback: (matches: RegExpMatchArray) => Promise<void> } => v !== null);
        mapped.forEach(a => list.push(a));
    };

    const initial = globalStorage.get(STORAGE_KEY);
    if (initial) apply(Array.isArray(initial) ? initial : []);

    client.scope.onDispose(globalStorage.onChange(STORAGE_KEY, (newValue) => {
        apply(Array.isArray(newValue) ? newValue : []);
    }));
}

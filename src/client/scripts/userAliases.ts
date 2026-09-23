import Client from "../Client";
import { characterStorage, globalStorage } from "@modules/core/storage";
import { isAutomationActiveNow, onAutomationScopeChange, type AutomationMeta } from "@modules/core/automation";
import { applyLinelessMacro, type UserMacro } from "./userTriggers";

export interface UserAlias extends AutomationMeta {
    pattern: string;
    /**
     * The commands to send, `;` or newline separated. When `macros` is set
     * this is only a mirror of its command actions, kept so writers and readers
     * that predate actions (the assistant, imports, an older synced client)
     * still see a working alias.
     */
    command: string;
    /** Actions run in order. Absent means one command action with `command`. */
    macros?: UserMacro[];
    /** Per character: replaces every command action of the alias. */
    overrides?: Record<string, string>;
}

/** The alias's actions, reading an alias saved before actions existed as one command. */
export function aliasActions(alias: Pick<UserAlias, "command" | "macros">): UserMacro[] {
    if (Array.isArray(alias.macros)) return alias.macros;
    return alias.command ? [{ type: "command", command: alias.command }] : [];
}

/** The `command` mirror of an action list. See `UserAlias.command`. */
export function aliasCommandMirror(macros: UserMacro[]): string {
    return macros
        .filter(m => m.type === "command" && m.command?.trim())
        .map(m => m.command!.trim())
        .join(";");
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

export function substituteGroups(cmd: string, m: RegExpMatchArray): string {
    return cmd.replace(/\$(\d+)/g, (_, n) => m[parseInt(n)] ?? '');
}

/**
 * The commands one command action sends for a match: `$1` groups filled and a
 * `$i` range expanded into one command per value. Each may still hold several
 * `;`-separated commands. Shared with the editor's preview.
 */
export function expandAliasCommand(command: string, m: RegExpMatchArray): string[] {
    const normalized = command.replace(/\n/g, ';');

    if (normalized.includes('$i')) {
        const range = findRange(m);
        if (range) {
            return expandRange(range.start, range.end)
                .map(val => substituteGroups(normalized, m).replace(/\$i/g, String(val)));
        }
    }

    return [substituteGroups(normalized, m)];
}

async function sendAliasCommand(client: Client, command: string, m: RegExpMatchArray): Promise<void> {
    for (const cmd of expandAliasCommand(command, m)) {
        await client.sendCommand(cmd);
    }
}

export default function initUserAliases(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const list = aliases || client.aliases;
    let mapped: { pattern: RegExp; callback: (matches: RegExpMatchArray) => Promise<void> }[] = [];

    let stored: UserAlias[] = [];

    const apply = (arr: UserAlias[] = stored) => {
        stored = arr;
        mapped.forEach(a => {
            const idx = list.indexOf(a);
            if (idx !== -1) list.splice(idx, 1);
        });
        mapped = arr.filter(isAutomationActiveNow).map(item => {
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
                    const override = char ? item.overrides?.[char] : undefined;
                    const actions = aliasActions(item);
                    // A character override stands in for all the command
                    // actions together, sent where the first of them was.
                    let overrideSent = false;
                    if (override && !actions.some(a => a.type === 'command')) {
                        overrideSent = true;
                        await sendAliasCommand(client, override, m);
                    }
                    for (const action of actions) {
                        if (action.type !== 'command') {
                            applyLinelessMacro(client, action, text => substituteGroups(text, m));
                        } else if (override) {
                            if (overrideSent) continue;
                            overrideSent = true;
                            await sendAliasCommand(client, override, m);
                        } else if (action.command) {
                            await sendAliasCommand(client, action.command, m);
                        }
                    }
                }
            };
        }).filter((v): v is { pattern: RegExp; callback: (matches: RegExpMatchArray) => Promise<void> } => v !== null);
        mapped.forEach(a => list.push(a));
    };

    const initial = globalStorage.get(STORAGE_KEY);
    if (initial) apply(Array.isArray(initial) ? initial : []);

    globalStorage.onChange(STORAGE_KEY, (newValue) => {
        apply(Array.isArray(newValue) ? newValue : []);
    });
    onAutomationScopeChange(() => apply());
}

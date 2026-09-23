import Client from "../Client";
import { PluginApiImpl } from "../PluginApi";
import eventBus from "@modules/core/eventBus";
import { globalStorage } from "@modules/core/storage";
import { isAutomationActiveNow, onAutomationScopeChange, type AutomationMeta } from "@modules/core/automation";
import { appendScriptLog } from "@modules/core/scriptConsole";

/**
 * A script in Automatyzacja: a JavaScript module whose default export runs
 * when an alias, trigger or event calls it ("Uruchom skrypt"), when its own
 * command is typed, or from the editor.
 *
 *     export default function leczenie(api, args, ctx) { ... }
 *
 * `api` is the plugin API (docs/PLUGINS.md), `args` the groups of the
 * alias/trigger that called it ($1 is args[0]) or the words after its
 * command, `ctx` says what started it and offers `ctx.log()` for the console.
 * A script is one run at a time: something that should stay registered
 * (a trigger, a popup) belongs in a plugin.
 */
export interface UserScript extends AutomationMeta {
    name: string;
    code: string;
    /** Typed as `/command args` it runs the script. */
    command?: string;
}

export type ScriptSource = "alias" | "trigger" | "event" | "command" | "manual";

export interface ScriptContext {
    source: ScriptSource;
    /** What started it, as the console names it: a pattern, an event. */
    label?: string;
    /** The game line, for a trigger. */
    line?: string;
    /** The event payload, for an event trigger. */
    event?: unknown;
    /** Writes to the script's console in Automatyzacja. */
    log: (...values: unknown[]) => void;
}

export const SCRIPTS_KEY = "automationScripts";

/** Scripts calling scripts (through commands and triggers) stop this deep. */
const MAX_DEPTH = 8;

type ScriptFn = (api: PluginApiImpl, args: string[], ctx: ScriptContext) => unknown;

interface Compiled {
    code: string;
    fn: ScriptFn;
}

const compiled = new Map<string, Compiled>();
const apis = new Map<string, PluginApiImpl>();
let depth = 0;

export function getUserScripts(): UserScript[] {
    const value = globalStorage.get(SCRIPTS_KEY);
    return Array.isArray(value) ? value : [];
}

function describe(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/** The script line an error happened on, read off the blob module's stack. */
function errorLine(err: unknown): number | null {
    const stack = err instanceof Error ? err.stack ?? "" : "";
    const m = stack.match(/blob:[^\s)]*:(\d+):\d+/);
    return m ? Number(m[1]) : null;
}

function errorText(err: unknown): string {
    const line = errorLine(err);
    return `blad: ${describe(err)}${line ? ` (linia ${line})` : ""}`;
}

async function compile(code: string): Promise<ScriptFn> {
    const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
    try {
        const module = await import(/* @vite-ignore */ url);
        if (typeof module.default !== "function") {
            throw new Error("skrypt musi eksportowac funkcje: export default function (api, args, ctx) { ... }");
        }
        return module.default as ScriptFn;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** How code becomes a function; swapped in unit tests, which cannot import blob URLs. */
export const scriptLoader = { compile };

function apiFor(client: Client, id: string): PluginApiImpl {
    let api = apis.get(id);
    if (!api) {
        api = new PluginApiImpl(client, `script:${id}`);
        apis.set(id, api);
    }
    return api;
}

/** Forgets a script's compiled code and what its API instance registered. */
function dispose(id: string): void {
    compiled.delete(id);
    const api = apis.get(id);
    if (api) {
        try {
            api.cleanup();
        } catch (err) {
            console.error("[userScripts] cleanup failed", err);
        }
        apis.delete(id);
    }
}

/**
 * The API a single run sees: the script's own instance, with sending and
 * printing also written to its console.
 */
function runApi(api: PluginApiImpl, id: string): PluginApiImpl {
    const view = Object.create(api) as PluginApiImpl;
    view.command = {
        ...api.command,
        send: (command: string, ...rest: unknown[]) => {
            appendScriptLog(id, "send", command);
            return (api.command.send as (...a: unknown[]) => Promise<void>)(command, ...rest);
        },
    };
    view.output = {
        ...api.output,
        print: text => {
            appendScriptLog(id, "print", typeof text === "string" ? text : text.text);
            api.output.print(text);
        },
    };
    return view;
}

export interface RunOptions {
    source: ScriptSource;
    label?: string;
    line?: string;
    event?: unknown;
    /** Run this code instead of the saved one (the editor's "Uruchom" on a draft). */
    code?: string;
    /** Run even when the script is switched off (the editor's "Uruchom"). */
    force?: boolean;
}

/**
 * Runs a script. Never throws: whatever goes wrong ends up in its console, so
 * a broken script cannot break the trigger or alias that called it.
 */
export async function runUserScript(client: Client, id: string, args: string[], options: RunOptions): Promise<void> {
    const script = getUserScripts().find(s => s.id === id);
    const code = options.code ?? script?.code;
    if (code === undefined) {
        console.warn(`[userScripts] no script ${id}`);
        return;
    }
    if (script && !options.force && !isAutomationActiveNow(script)) {
        appendScriptLog(id, "run", `pominiety (wylaczony) - ${options.label ?? options.source}`);
        return;
    }
    if (depth >= MAX_DEPTH) {
        appendScriptLog(id, "error", "blad: za duzo skryptow uruchomionych jeden w drugim - przerwano");
        return;
    }

    appendScriptLog(id, "run", `uruchomiony przez ${options.label ?? options.source}${args.length ? ` (${args.join(", ")})` : ""}`);
    depth++;
    try {
        let fn: ScriptFn;
        const cached = compiled.get(id);
        if (cached && cached.code === code) {
            fn = cached.fn;
        } else {
            fn = await scriptLoader.compile(code);
            // A draft run does not replace what the saved script runs.
            if (options.code === undefined || options.code === script?.code) compiled.set(id, { code, fn });
        }
        const ctx: ScriptContext = {
            source: options.source,
            label: options.label,
            line: options.line,
            event: options.event,
            log: (...values) => appendScriptLog(id, "log", values.map(describe).join(" ")),
        };
        await fn(runApi(apiFor(client, id), id), args, ctx);
    } catch (err) {
        appendScriptLog(id, "error", errorText(err));
        console.error(`[userScripts] script ${script?.name ?? id} failed`, err);
    } finally {
        depth--;
    }
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function initUserScripts(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const list = aliases || client.aliases;
    let registered: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];
    let known = new Map<string, string>();

    const apply = () => {
        const scripts = getUserScripts();

        // Changed or removed scripts drop their compiled code and registrations.
        const next = new Map(scripts.filter(s => s.id).map(s => [s.id!, s.code]));
        for (const [id, code] of known) {
            if (next.get(id) !== code) dispose(id);
        }
        known = next;

        registered.forEach(a => {
            const idx = list.indexOf(a);
            if (idx !== -1) list.splice(idx, 1);
        });
        registered = scripts
            .filter(s => s.id && s.command?.trim() && isAutomationActiveNow(s))
            .map(s => {
                const command = s.command!.trim().replace(/^\//, "");
                return {
                    pattern: new RegExp(`^/${escapeRegExp(command)}(?:\\s+(.*))?$`),
                    callback: (m: RegExpMatchArray) => {
                        const args = m[1]?.trim() ? m[1].trim().split(/\s+/) : [];
                        void runUserScript(client, s.id!, args, { source: "command", label: `/${command}` });
                    },
                };
            });
        registered.forEach(a => list.push(a));
    };

    apply();
    globalStorage.onChange(SCRIPTS_KEY, apply);
    onAutomationScopeChange(apply);

    eventBus.on("automation.runScript", ({ id, code }) => {
        void runUserScript(client, id, [], { source: "manual", label: "edytor", code, force: true });
    });
}

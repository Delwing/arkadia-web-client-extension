import Client from "../Client";
import { PluginApiImpl } from "../PluginApi";
import eventBus from "@modules/core/eventBus";
import { globalStorage } from "@modules/core/storage";
import { isAutomationActiveNow, onAutomationScopeChange, type AutomationMeta } from "@modules/core/automation";
import { appendScriptLog } from "@modules/core/scriptConsole";
import { SCRIPT_API_NAMES } from "./scriptScope";

/**
 * A script in Automatyzacja: JavaScript that runs when an alias, trigger or
 * event calls it ("Uruchom skrypt"), when its own command is typed, or from
 * the editor.
 *
 * The player writes only the body; it runs as an async function with these
 * in scope (see `toModuleSource`):
 *
 *     api   - the plugin API (docs/PLUGINS.md)
 *     args  - the groups of the alias/trigger that called it ($1 is args[0]),
 *             or the words after its command
 *     ctx   - what started it (source, label, line, event), ctx.log() and
 *             ctx.vars
 *     vars  - one object shared by every script (ctx.vars)
 *     log, send, print, gmcp - shortcuts for ctx.log, api.command.send,
 *             api.output.print and api.gmcp.get() at the start of the run
 *     command, map, team, … - every section of api by its own name
 *             (SCRIPT_API_NAMES), so api. can be left out
 *
 * Code that exports a default function (or imports something) runs as a
 * whole module instead, called with (api, args, ctx). A script is one run at a
 * time: something that should stay registered (a trigger, a popup) belongs in
 * a plugin.
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
    /** Shared by every script, so one can leave data for another. See `sharedVars`. */
    vars: Record<string, any>;
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

/**
 * What scripts keep for each other: `vars.cel = args[0]` in one, `vars.cel`
 * in the next. Like globals in Mudlet it lives as long as the page, and is
 * not stored: data that changes every fight has no business in storage sync.
 */
const sharedVars: Record<string, any> = {};

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

/**
 * What a body-only script has in scope besides api, args and ctx. One line,
 * so the body starts on line 2 of the module.
 */
const SCOPE = `const { ${SCRIPT_API_NAMES.join(", ")} } = api; `
    + "const vars = ctx.vars, log = ctx.log, send = (command) => api.command.send(command), "
    + "print = (text) => api.output.print(text), gmcp = api.gmcp.get();";

/** Code that is a module of its own rather than a function body. */
export function isModuleScript(code: string): boolean {
    return /^\s*(export\s+default\b|import[\s{*])/m.test(code);
}

/**
 * The module a script's code runs as: a body is wrapped in an async default
 * function with the scope above, a module is used as it is.
 *
 * The body gets a function of its own inside that one, so a script may name
 * its own variable `map` or `settings`: it shadows the API section instead of
 * clashing with it.
 */
export function toModuleSource(code: string): string {
    if (isModuleScript(code)) return code;
    return `export default async function (api, args, ctx) { ${SCOPE} return (async () => {\n${code}\n})(); }\n`;
}

/** The script line an error happened on, read off the blob module's stack. */
function errorLine(err: unknown, code: string): number | null {
    const stack = err instanceof Error ? err.stack ?? "" : "";
    const m = stack.match(/blob:[^\s)]*:(\d+):\d+/);
    if (!m) return null;
    // The wrapper's first line comes before a body's first line.
    const line = Number(m[1]) - (isModuleScript(code) ? 0 : 1);
    return line > 0 ? line : null;
}

function errorText(err: unknown, code: string): string {
    const line = errorLine(err, code);
    return `blad: ${describe(err)}${line ? ` (linia ${line})` : ""}`;
}

async function compile(code: string): Promise<ScriptFn> {
    const url = URL.createObjectURL(new Blob([toModuleSource(code)], { type: "application/javascript" }));
    try {
        const module = await import(/* @vite-ignore */ url);
        if (typeof module.default !== "function") {
            throw new Error("modul skryptu musi eksportowac funkcje: export default function (api, args, ctx) { ... }");
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
            vars: sharedVars,
        };
        await fn(runApi(apiFor(client, id), id), args, ctx);
    } catch (err) {
        appendScriptLog(id, "error", errorText(err, code));
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

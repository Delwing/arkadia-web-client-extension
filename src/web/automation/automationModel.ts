/**
 * The Automatyzacja window's view of the stored aliases and triggers: one list
 * of items with a stable id, the drafts the editor works on, and the writes
 * back to the `aliases` / `triggers` keys.
 *
 * Aliases and triggers stay in their own keys (see @modules/core/automation for
 * why); only this module knows they are shown together.
 */
import { globalStorage } from "@modules/core/storage";
import {
    automationGroupName,
    ensureAutomationGroup,
    getAutomationGroups,
    newAutomationId,
    saveAutomationGroups,
    setAutomationGroupEnabled,
    type AutomationGroup,
} from "@modules/core/automation";
import type { UserScript } from "@client/scripts/userScripts";
import { aliasActions, aliasCommandMirror, type UserAlias } from "@client/scripts/userAliases";
import {
    CONDITION_OPERATORS,
    SUPPORTED_EVENTS,
    canonicalEventId,
    type TriggerCondition,
    type UserMacro,
    type UserTrigger,
} from "@client/scripts/userTriggers";
import { normalizeTriggerList } from "@web/options/userTriggerNormalize.ts";
import { normalizeMacro } from "./MacroEditor";

export type AutomationKind = "alias" | "trigger" | "script";

export type AutomationItem =
    | { kind: "alias"; id: string; data: UserAlias }
    | { kind: "trigger"; id: string; data: UserTrigger }
    | { kind: "script"; id: string; data: UserScript };

type AutomationData = UserAlias | UserTrigger | UserScript;

export const KIND_LABEL: Record<AutomationKind, string> = { alias: "Alias", trigger: "Wyzwalacz", script: "Skrypt" };

/** A script's command: letters, digits, _ and -, typed after a slash. */
const SCRIPT_COMMAND = /^[A-Za-z0-9_-]+$/;

// ── Reading and writing ──────────────────────────────────────────────────────

function storedAliases(): UserAlias[] {
    const value = globalStorage.get("aliases");
    return Array.isArray(value) ? value : [];
}

function storedTriggers(): UserTrigger[] {
    const value = globalStorage.get("triggers");
    return Array.isArray(value) ? normalizeTriggerList(value) : [];
}

export function storedScripts(): UserScript[] {
    const value = globalStorage.get("automationScripts");
    return Array.isArray(value) ? value : [];
}

/**
 * Gives every stored alias and trigger an id, writing only when one lacked it.
 * The window selects and edits by id, so ids made up per read would lose the
 * selection whenever the list reloads.
 */
export function ensureStoredIds(): void {
    const aliases = storedAliases();
    if (aliases.some(a => !a.id)) {
        globalStorage.set("aliases", aliases.map(a => (a.id ? a : { ...a, id: newAutomationId() })));
    }
    const triggers = storedTriggers();
    if (triggers.some(t => !t.id)) {
        globalStorage.set("triggers", triggers.map(t => (t.id ? t : { ...t, id: newAutomationId() })));
    }
    const scripts = storedScripts();
    if (scripts.some(t => !t.id)) {
        globalStorage.set("automationScripts", scripts.map(t => (t.id ? t : { ...t, id: newAutomationId() })));
    }
}

export function loadItems(): AutomationItem[] {
    return [
        ...storedAliases().filter(a => a.id).map(data => ({ kind: "alias" as const, id: data.id!, data })),
        ...storedTriggers().filter(t => t.id).map(data => ({ kind: "trigger" as const, id: data.id!, data })),
        ...storedScripts().filter(t => t.id).map(data => ({ kind: "script" as const, id: data.id!, data })),
    ];
}

/** Replaces the stored element with the same id, or appends it. */
export function writeItem(item: AutomationItem): void {
    if (item.kind === "alias") {
        const list = storedAliases();
        const idx = list.findIndex(a => a.id === item.id);
        globalStorage.set("aliases", idx === -1 ? [...list, item.data] : list.map((a, i) => (i === idx ? item.data : a)));
    } else if (item.kind === "script") {
        const list = storedScripts();
        const idx = list.findIndex(a => a.id === item.id);
        globalStorage.set("automationScripts", idx === -1 ? [...list, item.data] : list.map((a, i) => (i === idx ? item.data : a)));
    } else {
        const list = storedTriggers();
        const idx = list.findIndex(t => t.id === item.id);
        const next = idx === -1 ? [...list, item.data] : list.map((t, i) => (i === idx ? item.data : t));
        globalStorage.set("triggers", normalizeTriggerList(next));
    }
}

export function removeItem(kind: AutomationKind, id: string): void {
    if (kind === "alias") globalStorage.set("aliases", storedAliases().filter(a => a.id !== id));
    else if (kind === "script") globalStorage.set("automationScripts", storedScripts().filter(t => t.id !== id));
    else globalStorage.set("triggers", storedTriggers().filter(t => t.id !== id));
}

export function setItemEnabled(item: AutomationItem, enabled: boolean): void {
    const { enabled: _old, ...rest } = item.data;
    const data = enabled ? rest : { ...rest, enabled: false };
    writeItem({ ...item, data } as AutomationItem);
}

export function setGroupEnabled(id: string, enabled: boolean): void {
    setAutomationGroupEnabled(id, enabled);
}

export function renameGroup(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveAutomationGroups(getAutomationGroups().map(g => (g.id === id ? { ...g, name: trimmed } : g)));
}

/** A group named "Nowa grupa" (numbered when taken), added last; its id. */
export function createGroup(base = "Nowa grupa"): string {
    const groups = getAutomationGroups();
    const taken = new Set(groups.map(g => g.name.toLowerCase()));
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    const id = newAutomationId();
    saveAutomationGroups([...groups, { id, name }]);
    return id;
}

/** Moves a group before another one, or to the end. */
export function moveGroup(id: string, beforeId?: string): void {
    const groups = getAutomationGroups();
    const moving = groups.find(g => g.id === id);
    if (!moving || id === beforeId) return;
    const rest = groups.filter(g => g.id !== id);
    const idx = beforeId ? rest.findIndex(g => g.id === beforeId) : -1;
    rest.splice(idx === -1 ? rest.length : idx, 0, moving);
    saveAutomationGroups(rest);
}

/**
 * The group an element is shown in: its own, unless that group no longer
 * exists (deleted, or not synced yet), in which case none.
 */
export function effectiveGroup(item: AutomationItem, groups: AutomationGroup[]): string | undefined {
    const group = item.data.group;
    return group && groups.some(g => g.id === group) ? group : undefined;
}

/** Elements in their set order; ones never placed keep their stored order, after the placed ones. */
export function sortItems(items: AutomationItem[]): AutomationItem[] {
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => (a.item.data.order ?? Infinity) - (b.item.data.order ?? Infinity) || a.index - b.index)
        .map(({ item }) => item);
}

/** Writes changed elements, each storage key once. */
function writeMany(changed: AutomationItem[]): void {
    for (const kind of ["alias", "trigger", "script"] as const) {
        const mine = changed.filter(i => i.kind === kind);
        if (!mine.length) continue;
        const byId = new Map(mine.map(i => [i.id, i.data]));
        if (kind === "alias") globalStorage.set("aliases", storedAliases().map(a => (a.id && byId.get(a.id) as UserAlias) || a));
        else if (kind === "script") globalStorage.set("automationScripts", storedScripts().map(a => (a.id && byId.get(a.id) as UserScript) || a));
        else globalStorage.set("triggers", normalizeTriggerList(storedTriggers().map(a => (a.id && byId.get(a.id) as UserTrigger) || a)));
    }
}

function placed<T extends AutomationData>(data: T, group: string | undefined, order: number): T {
    const { group: _g, order: _o, ...rest } = data;
    return { ...rest, ...(group ? { group } : {}), order } as T;
}

/**
 * Moves an element into a group (undefined: none), before another element
 * of that group or to its end, and numbers the group's elements in their new
 * order. Aliases, triggers and scripts share one order within a group.
 */
export function moveItem(kind: AutomationKind, id: string, group: string | undefined, beforeId?: string): void {
    const groups = getAutomationGroups();
    const items = loadItems();
    const moving = items.find(i => i.kind === kind && i.id === id);
    if (!moving || (beforeId === id)) return;
    const members = sortItems(items.filter(i => i !== moving && effectiveGroup(i, groups) === group));
    const idx = beforeId ? members.findIndex(i => i.id === beforeId) : -1;
    members.splice(idx === -1 ? members.length : idx, 0, moving);
    const changed = members
        .map((item, order) => ({ item, order }))
        .filter(({ item, order }) => item.data.order !== order || (item === moving && item.data.group !== group))
        .map(({ item, order }) => ({ ...item, data: placed(item.data, group, order) }) as AutomationItem);
    writeMany(changed);
}

/** Deletes the group together with everything in it. */
export function deleteGroup(id: string): void {
    const outside = (item: { group?: string }) => item.group !== id;
    const aliases = storedAliases();
    if (!aliases.every(outside)) globalStorage.set("aliases", aliases.filter(outside));
    const triggers = storedTriggers();
    if (!triggers.every(outside)) globalStorage.set("triggers", triggers.filter(outside));
    const scripts = storedScripts();
    if (!scripts.every(outside)) globalStorage.set("automationScripts", scripts.filter(outside));
    saveAutomationGroups(getAutomationGroups().filter(g => g.id !== id));
}

// ── Drafts ───────────────────────────────────────────────────────────────────

/**
 * What the editor holds while an element is being edited. An alias always
 * carries its actions as a list here, whichever way it is stored.
 *
 * Where the element sits (group, order) is not the editor's business: it is
 * changed by dragging in the list, and taken from storage on save (see
 * `placeDraft`), so a move made while editing is not undone by saving.
 */
export interface Draft {
    kind: AutomationKind;
    id: string;
    /** Not stored yet. */
    isNew: boolean;
    data: AutomationData;
}

export function draftFromItem(item: AutomationItem): Draft {
    if (item.kind === "alias") {
        // The command used to be a textarea where a newline separated commands;
        // the action field is one line, and would drop them.
        const macros = aliasActions(item.data).map(m =>
            m.type === "command" && m.command ? { ...m, command: m.command.replace(/\n+/g, ";") } : normalizeMacro(m),
        );
        return { kind: "alias", id: item.id, isNew: false, data: { ...item.data, macros } };
    }
    if (item.kind === "script") return { kind: "script", id: item.id, isNew: false, data: { ...item.data } };
    return { kind: "trigger", id: item.id, isNew: false, data: { ...item.data, macros: item.data.macros.map(normalizeMacro) } };
}

/** What a new script starts with. */
export const NEW_SCRIPT = `// Pod reka: args (grupy z wzorca, $1 to args[0]), api (API wtyczek),
// ctx oraz skroty log(), send(), print() i gmcp.
log('uruchomiony', args);
`;

/** A new element, in `group` when given. */
export function newDraft(kind: AutomationKind, group?: string): Draft {
    const id = newAutomationId();
    const data: AutomationData = kind === "alias"
        ? { id, pattern: "", command: "", macros: [{ type: "command", command: "" }] }
        : kind === "script"
            ? { id, name: "", code: NEW_SCRIPT }
            : { id, type: "pattern", pattern: "", macros: [] };
    if (group) data.group = group;
    return { kind, id, isNew: true, data };
}

/** Same content, wherever each one sits. */
export function sameDraft(a: Draft, b: Draft): boolean {
    const content = (d: Draft) => {
        const { group: _g, order: _o, ...rest } = d.data;
        return JSON.stringify(rest);
    };
    return content(a) === content(b);
}

/**
 * The draft with its place taken from storage: an element's current group and
 * order, or for a new one the end of its group.
 */
export function placeDraft(draft: Draft, items: AutomationItem[]): Draft {
    const groups = getAutomationGroups();
    const stored = items.find(i => i.kind === draft.kind && i.id === draft.id);
    if (stored) {
        return { ...draft, data: placed(draft.data, effectiveGroup(stored, groups), stored.data.order ?? 0) };
    }
    const group = draft.data.group && groups.some(g => g.id === draft.data.group) ? draft.data.group : undefined;
    const last = Math.max(-1, ...items.filter(i => effectiveGroup(i, groups) === group).map(i => i.data.order ?? -1));
    return { ...draft, data: placed(draft.data, group, last + 1) };
}

/** An action that would do nothing without a line: no text to fall back on. */
export function isEmptyLinelessAction(m: UserMacro): boolean {
    switch (m.type) {
        case "command": return !m.command?.trim();
        case "notify":
        case "push":
        case "speak":
        case "echo": return !m.message?.trim();
        case "functionalBind": return !m.label?.trim() || !m.command?.trim();
        case "script": return !m.scriptId;
        case "group": return !m.groupId;
        default: return false;
    }
}

function compiles(source: string): boolean {
    try {
        new RegExp(source);
        return true;
    } catch {
        return false;
    }
}

/** Why the draft cannot be saved, or null. */
export function draftError(draft: Draft, items: AutomationItem[]): string | null {
    if (draft.kind === "script") {
        const script = draft.data as UserScript;
        if (!script.name?.trim()) return "Nadaj skryptowi nazwe.";
        if (!script.code.trim()) return "Skrypt nie ma kodu.";
        const command = script.command?.trim().replace(/^\//, "") ?? "";
        if (command && !SCRIPT_COMMAND.test(command)) return "Komenda moze miec tylko litery, cyfry, _ i -.";
        if (command && items.some(i => i.kind === "script" && i.id !== draft.id && i.data.command?.trim().replace(/^\//, "") === command)) {
            return "Inny skrypt ma juz te komende.";
        }
        return null;
    }
    if (draft.kind === "alias") {
        const alias = draft.data as UserAlias;
        const pattern = alias.pattern.trim();
        if (!pattern) return "Wpisz wzorzec.";
        if (!compiles(`^${pattern}$`)) return "Wzorzec nie jest poprawnym wyrazeniem regularnym.";
        if (items.some(i => i.kind === "alias" && i.id !== draft.id && i.data.pattern === pattern)) {
            return "Alias o takim wzorcu juz istnieje.";
        }
        if (!aliasActions(alias).some(m => !isEmptyLinelessAction(m))) return "Dodaj co najmniej jedna akcje.";
        return null;
    }
    const trigger = draft.data as UserTrigger;
    if (trigger.type === "event") return trigger.event ? null : "Wybierz zdarzenie.";
    const pattern = trigger.pattern?.trim() ?? "";
    if (!pattern) return "Wpisz wzorzec.";
    if (!compiles(pattern)) return "Wzorzec nie jest poprawnym wyrazeniem regularnym.";
    return null;
}

/** The stored form of a draft. */
export function itemFromDraft(draft: Draft): AutomationItem {
    const meta = (data: AutomationData) => {
        const { name, characters, ...rest } = data;
        return {
            ...rest,
            ...(name?.trim() ? { name: name.trim() } : {}),
            ...(characters?.length ? { characters } : {}),
        };
    };

    if (draft.kind === "alias") {
        const alias = meta(draft.data) as UserAlias;
        const actions = aliasActions(alias).filter(m => !isEmptyLinelessAction(m)).map(normalizeMacro);
        const overrides = Object.fromEntries(
            Object.entries(alias.overrides ?? {}).map(([c, cmd]) => [c, cmd.trim()]).filter(([, cmd]) => cmd),
        );
        const { macros: _m, overrides: _o, ...base } = alias;
        // A single command is stored the way aliases always were, so the most
        // common alias stays readable by everything that predates actions.
        const onlyCommand = actions.length === 1 && actions[0].type === "command";
        const data: UserAlias = {
            ...base,
            pattern: alias.pattern.trim(),
            command: aliasCommandMirror(actions),
            ...(onlyCommand ? {} : { macros: actions }),
            ...(Object.keys(overrides).length ? { overrides } : {}),
        };
        return { kind: "alias", id: draft.id, data };
    }

    if (draft.kind === "script") {
        const script = meta(draft.data) as UserScript;
        const { command, ...base } = script;
        const cmd = command?.trim().replace(/^\//, "");
        const data: UserScript = { ...base, name: script.name?.trim() ?? "", ...(cmd ? { command: cmd } : {}) };
        return { kind: "script", id: draft.id, data };
    }

    const trigger = meta(draft.data) as UserTrigger;
    const { pattern, event, flags, gmcpMsgType, conditions, type: _t, ...base } = trigger;
    const data: UserTrigger = trigger.type === "event"
        ? { ...base, type: "event", event, ...(conditions?.length ? { conditions } : {}) }
        : {
            ...base,
            type: "pattern",
            pattern: pattern?.trim(),
            ...(flags ? { flags } : {}),
            ...(gmcpMsgType ? { gmcpMsgType } : {}),
        };
    return { kind: "trigger", id: draft.id, data };
}

// ── What a list row says ─────────────────────────────────────────────────────

export function eventLabel(event: string | undefined): string {
    if (!event) return "";
    const id = canonicalEventId(event);
    return SUPPORTED_EVENTS.find(e => e.id === id)?.label ?? id;
}

/** A few words per action, for the row under the pattern. */
export function actionShort(m: UserMacro, pluginLabel?: (type: string) => string | undefined): string {
    switch (m.type) {
        case "command": return m.command?.trim() || "komenda";
        case "uppercase": return "wielkie litery";
        case "color": return m.background ? (m.color ? "koloruj tekst i tlo" : "koloruj tlo") : "koloruj";
        case "replace": return m.to ? `zamien na "${m.to}"` : "usun tekst";
        case "wrap": return "otocz";
        case "beep": return "dzwiek";
        case "mute": return "wycisz dzwieki";
        case "unmute": return "wlacz dzwieki";
        case "slowBlink":
        case "rapidBlink": return "miganie";
        case "dim": return "pulsowanie";
        case "functionalBind": return m.label ? `bind [${m.label}]` : "bind";
        case "notify": return m.message ? `powiadomienie "${m.message}"` : "powiadomienie";
        case "push": return m.message ? `na telefon "${m.message}"` : "na telefon";
        case "speak": return m.message ? `czytaj "${m.message}"` : "czytaj";
        case "echo": return m.message ? `wypisz "${m.message}"` : "wypisz";
        case "script": return `skrypt ${storedScripts().find(sc => sc.id === m.scriptId)?.name || "?"}`;
        case "group": {
            const verb = m.groupState === "on" ? "wlacz" : m.groupState === "off" ? "wylacz" : "przelacz";
            return `${verb} grupe ${automationGroupName(m.groupId) || "?"}`;
        }
        default: return pluginLabel?.(m.type) ?? m.type;
    }
}

export function itemActions(item: AutomationItem): UserMacro[] {
    if (item.kind === "script") return [];
    return item.kind === "alias" ? aliasActions(item.data) : item.data.macros ?? [];
}

/** The aliases and triggers that run a script. */
export function scriptUsers(scriptId: string, items: AutomationItem[]): AutomationItem[] {
    return items.filter(i => itemActions(i).some(m => m.type === "script" && m.scriptId === scriptId));
}

/** The row's first line: the name, else what starts it. */
export function itemTitle(item: AutomationItem): { text: string; mono: boolean; prefix?: string } {
    const name = item.data.name?.trim();
    if (name) return { text: name, mono: false };
    if (item.kind === "script") return { text: "(skrypt bez nazwy)", mono: false };
    if (item.kind === "trigger" && item.data.type === "event") {
        return { text: eventLabel(item.data.event), mono: false, prefix: "Zdarzenie:" };
    }
    const pattern = item.kind === "alias" ? item.data.pattern : item.data.pattern ?? "";
    return { text: pattern || "(pusty wzorzec)", mono: true };
}

/** `hp <= 2, name jest Zbojca`: an event trigger's conditions in one line. */
export function conditionsText(conditions: TriggerCondition[] = []): string {
    return conditions
        .filter(c => c.arg)
        .map(c => `${c.arg} ${CONDITION_OPERATORS.find(o => o.id === c.op)?.label ?? c.op} ${c.value}`)
        .join(", ");
}

/** The row's second line: what it does (and what starts it, when the name took the first). */
export function itemSummary(
    item: AutomationItem,
    pluginLabel?: (type: string) => string | undefined,
    items: AutomationItem[] = [],
): string {
    if (item.kind === "script") {
        const users = scriptUsers(item.id, items).length;
        const used = users ? `uzywany przez ${users} ${users === 1 ? "element" : users < 5 ? "elementy" : "elementow"}` : "nieuzywany";
        return item.data.command ? `/${item.data.command} \u00b7 ${used}` : used;
    }
    const actions = itemActions(item).map(m => actionShort(m, pluginLabel));
    let does = actions.length ? `→ ${actions.join(item.kind === "alias" ? " ; " : ", ")}` : "brak akcji";
    const when = item.kind === "trigger" && item.data.type === "event" ? conditionsText(item.data.conditions) : "";
    if (when) does = `gdy ${when} ${does}`;
    if (!item.data.name?.trim()) return does;
    const source = item.kind === "trigger" && item.data.type === "event"
        ? eventLabel(item.data.event)
        : item.kind === "alias" ? item.data.pattern : item.data.pattern ?? "";
    return `${source} ${does}`;
}

/** Lower-cased text the search matches: patterns, commands, messages, name, group, characters. */
export function itemSearchText(item: AutomationItem, groups: AutomationGroup[]): string {
    const d = item.data;
    const parts = [
        d.name ?? "",
        automationGroupName(d.group, groups),
        ...(d.characters ?? []),
        item.kind === "alias" ? item.data.pattern : item.kind === "trigger" ? item.data.pattern ?? "" : "",
        item.kind === "script" ? `/${item.data.command ?? ""}\n${item.data.code}` : "",
        item.kind === "trigger" ? eventLabel(item.data.event) : "",
        item.kind === "trigger" ? item.data.event ?? "" : "",
        item.kind === "trigger" ? item.data.gmcpMsgType ?? "" : "",
        ...itemActions(item).flatMap(m => [m.command ?? "", m.message ?? "", m.label ?? "", m.to ?? ""]),
        ...(item.kind === "alias" ? Object.entries(item.data.overrides ?? {}).flat() : []),
    ];
    return parts.join("\n").toLowerCase();
}

// ── Packs: export and import ─────────────────────────────────────────────────

export const PACK_FORMAT = "arkadia-automatyzacja";

export interface AutomationPack {
    format: typeof PACK_FORMAT;
    version: 1;
    groups: AutomationGroup[];
    aliases: UserAlias[];
    triggers: UserTrigger[];
    scripts?: UserScript[];
}

/** Everything, or only one group (with the group itself). */
export function buildPack(groupId?: string): AutomationPack {
    const inScope = (item: { group?: string }) => groupId === undefined || item.group === groupId;
    const aliases = storedAliases().filter(inScope);
    const triggers = storedTriggers().filter(inScope);
    const scripts = storedScripts().filter(inScope);
    const used = new Set([...aliases, ...triggers, ...scripts].map(i => i.group).filter(Boolean));
    return {
        format: PACK_FORMAT,
        version: 1,
        groups: getAutomationGroups().filter(g => used.has(g.id)),
        aliases,
        triggers,
        scripts,
    };
}

export function parsePack(text: string): AutomationPack {
    const value = JSON.parse(text);
    if (!value || value.format !== PACK_FORMAT || !Array.isArray(value.aliases) || !Array.isArray(value.triggers)) {
        throw new Error("To nie jest plik automatyzacji z tego klienta.");
    }
    return {
        ...value,
        groups: Array.isArray(value.groups) ? value.groups : [],
        scripts: Array.isArray(value.scripts) ? value.scripts : [],
    };
}

/**
 * Adds a pack to what is stored. Its groups are matched to existing ones by
 * name; everything gets new ids, so importing the same file twice never
 * overwrites, and the actions that run a script or switch a group are pointed
 * at the new ids. An alias whose pattern already exists is skipped, and so is
 * a trigger or script identical to one already there. Everything keeps the
 * on/off state it had in the pack, scripts included.
 */
export function importPack(pack: AutomationPack): { aliases: number; triggers: number; scripts: number; skipped: number } {
    const groupIds = new Map<string, string>();
    for (const g of pack.groups) {
        const id = ensureAutomationGroup(g.name);
        if (id) groupIds.set(g.id, id);
    }
    let skipped = 0;

    const scripts = storedScripts();
    const scriptIds = new Map<string, string>();
    const newScripts: UserScript[] = [];
    for (const sc of pack.scripts ?? []) {
        const same = scripts.find(o => o.name === sc.name && o.code === sc.code);
        if (same?.id) {
            if (sc.id) scriptIds.set(sc.id, same.id);
            skipped++;
            continue;
        }
        const id = newAutomationId();
        if (sc.id) scriptIds.set(sc.id, id);
        const { group, ...rest } = sc;
        const mapped = group ? groupIds.get(group) : undefined;
        newScripts.push({ ...rest, id, ...(mapped ? { group: mapped } : {}) });
    }
    if (newScripts.length) globalStorage.set("automationScripts", [...scripts, ...newScripts]);

    const remapMacro = (m: UserMacro): UserMacro => {
        if (m.type === "script" && m.scriptId) return { ...m, scriptId: scriptIds.get(m.scriptId) ?? m.scriptId };
        if (m.type === "group" && m.groupId) return { ...m, groupId: groupIds.get(m.groupId) ?? m.groupId };
        return m;
    };
    const remap = <T extends UserAlias | UserTrigger>(item: T): T => {
        const { group, ...rest } = item;
        const mapped = group ? groupIds.get(group) : undefined;
        const macros = item.macros?.map(remapMacro);
        return { ...rest, id: newAutomationId(), ...(macros ? { macros } : {}), ...(mapped ? { group: mapped } : {}) } as T;
    };

    const aliases = storedAliases();
    const newAliases = pack.aliases.filter(a => {
        const dup = aliases.some(b => b.pattern === a.pattern);
        if (dup) skipped++;
        return !dup;
    }).map(remap);
    if (newAliases.length) globalStorage.set("aliases", [...aliases, ...newAliases]);

    const triggers = storedTriggers();
    const shape = (t: UserTrigger) => JSON.stringify([t.type ?? "pattern", t.pattern ?? "", t.event ?? "", t.flags ?? "", t.gmcpMsgType ?? "", t.macros]);
    const known = new Set(triggers.map(shape));
    const newTriggers = normalizeTriggerList(pack.triggers).map(remap).filter(t => {
        const dup = known.has(shape(t));
        if (dup) skipped++;
        return !dup;
    });
    if (newTriggers.length) globalStorage.set("triggers", normalizeTriggerList([...triggers, ...newTriggers]));

    return { aliases: newAliases.length, triggers: newTriggers.length, scripts: newScripts.length, skipped };
}

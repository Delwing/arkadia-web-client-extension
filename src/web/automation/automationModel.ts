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
    type AutomationGroup,
} from "@modules/core/automation";
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

export type AutomationKind = "alias" | "trigger";

export type AutomationItem =
    | { kind: "alias"; id: string; data: UserAlias }
    | { kind: "trigger"; id: string; data: UserTrigger };

export const KIND_LABEL: Record<AutomationKind, string> = { alias: "Alias", trigger: "Wyzwalacz" };

// ── Reading and writing ──────────────────────────────────────────────────────

function storedAliases(): UserAlias[] {
    const value = globalStorage.get("aliases");
    return Array.isArray(value) ? value : [];
}

function storedTriggers(): UserTrigger[] {
    const value = globalStorage.get("triggers");
    return Array.isArray(value) ? normalizeTriggerList(value) : [];
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
}

export function loadItems(): AutomationItem[] {
    return [
        ...storedAliases().filter(a => a.id).map(data => ({ kind: "alias" as const, id: data.id!, data })),
        ...storedTriggers().filter(t => t.id).map(data => ({ kind: "trigger" as const, id: data.id!, data })),
    ];
}

/** Replaces the stored element with the same id, or appends it. */
export function writeItem(item: AutomationItem): void {
    if (item.kind === "alias") {
        const list = storedAliases();
        const idx = list.findIndex(a => a.id === item.id);
        globalStorage.set("aliases", idx === -1 ? [...list, item.data] : list.map((a, i) => (i === idx ? item.data : a)));
    } else {
        const list = storedTriggers();
        const idx = list.findIndex(t => t.id === item.id);
        const next = idx === -1 ? [...list, item.data] : list.map((t, i) => (i === idx ? item.data : t));
        globalStorage.set("triggers", normalizeTriggerList(next));
    }
}

export function removeItem(kind: AutomationKind, id: string): void {
    if (kind === "alias") globalStorage.set("aliases", storedAliases().filter(a => a.id !== id));
    else globalStorage.set("triggers", storedTriggers().filter(t => t.id !== id));
}

export function setItemEnabled(item: AutomationItem, enabled: boolean): void {
    const { enabled: _old, ...rest } = item.data;
    const data = enabled ? rest : { ...rest, enabled: false };
    writeItem({ ...item, data } as AutomationItem);
}

export function setGroupEnabled(id: string, enabled: boolean): void {
    saveAutomationGroups(getAutomationGroups().map(g => {
        if (g.id !== id) return g;
        const { enabled: _old, ...rest } = g;
        return enabled ? rest : { ...rest, enabled: false };
    }));
}

export function renameGroup(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveAutomationGroups(getAutomationGroups().map(g => (g.id === id ? { ...g, name: trimmed } : g)));
}

/** Deletes the group; what was in it stays, without a group. */
export function deleteGroup(id: string): void {
    const ungroup = <T extends { group?: string }>(item: T): T => {
        if (item.group !== id) return item;
        const { group: _old, ...rest } = item;
        return rest as T;
    };
    const aliases = storedAliases();
    if (aliases.some(a => a.group === id)) globalStorage.set("aliases", aliases.map(ungroup));
    const triggers = storedTriggers();
    if (triggers.some(t => t.group === id)) globalStorage.set("triggers", triggers.map(ungroup));
    saveAutomationGroups(getAutomationGroups().filter(g => g.id !== id));
}

// ── Drafts ───────────────────────────────────────────────────────────────────

/**
 * What the editor holds while an element is being edited. The group is kept
 * by name, so a new one can be typed in; it becomes an id only on save. An
 * alias always carries its actions as a list here, whichever way it is stored.
 */
export interface Draft {
    kind: AutomationKind;
    id: string;
    /** Not stored yet. */
    isNew: boolean;
    groupName: string;
    data: UserAlias | UserTrigger;
}

export function draftFromItem(item: AutomationItem, groups: AutomationGroup[] = getAutomationGroups()): Draft {
    const groupName = automationGroupName(item.data.group, groups);
    if (item.kind === "alias") {
        // The command used to be a textarea where a newline separated commands;
        // the action field is one line, and would drop them.
        const macros = aliasActions(item.data).map(m =>
            m.type === "command" && m.command ? { ...m, command: m.command.replace(/\n+/g, ";") } : normalizeMacro(m),
        );
        return { kind: "alias", id: item.id, isNew: false, groupName, data: { ...item.data, macros } };
    }
    return { kind: "trigger", id: item.id, isNew: false, groupName, data: { ...item.data, macros: item.data.macros.map(normalizeMacro) } };
}

export function newDraft(kind: AutomationKind, groupName = ""): Draft {
    const id = newAutomationId();
    const data: UserAlias | UserTrigger = kind === "alias"
        ? { id, pattern: "", command: "", macros: [{ type: "command", command: "" }] }
        : { id, type: "pattern", pattern: "", macros: [] };
    return { kind, id, isNew: true, groupName, data };
}

export function sameDraft(a: Draft, b: Draft): boolean {
    return a.groupName.trim() === b.groupName.trim() && JSON.stringify(a.data) === JSON.stringify(b.data);
}

/** An action that would do nothing without a line: no text to fall back on. */
export function isEmptyLinelessAction(m: UserMacro): boolean {
    switch (m.type) {
        case "command": return !m.command?.trim();
        case "notify":
        case "push":
        case "speak": return !m.message?.trim();
        case "functionalBind": return !m.label?.trim() || !m.command?.trim();
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

/** The stored form of a draft. Creates the draft's group if it is new. */
export function itemFromDraft(draft: Draft): AutomationItem {
    const group = ensureAutomationGroup(draft.groupName);
    const meta = (data: UserAlias | UserTrigger) => {
        const { group: _g, name, characters, ...rest } = data;
        return {
            ...rest,
            ...(name?.trim() ? { name: name.trim() } : {}),
            ...(group ? { group } : {}),
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
        case "color": return "koloruj";
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
        default: return pluginLabel?.(m.type) ?? m.type;
    }
}

export function itemActions(item: AutomationItem): UserMacro[] {
    return item.kind === "alias" ? aliasActions(item.data) : item.data.macros ?? [];
}

/** The row's first line: the name, else what starts it. */
export function itemTitle(item: AutomationItem): { text: string; mono: boolean; prefix?: string } {
    const name = item.data.name?.trim();
    if (name) return { text: name, mono: false };
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
export function itemSummary(item: AutomationItem, pluginLabel?: (type: string) => string | undefined): string {
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
        item.kind === "alias" ? item.data.pattern : item.data.pattern ?? "",
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
}

/** Everything, or only one group (with the group itself). */
export function buildPack(groupId?: string): AutomationPack {
    const inScope = (item: { group?: string }) => groupId === undefined || item.group === groupId;
    const aliases = storedAliases().filter(inScope);
    const triggers = storedTriggers().filter(inScope);
    const used = new Set([...aliases, ...triggers].map(i => i.group).filter(Boolean));
    return {
        format: PACK_FORMAT,
        version: 1,
        groups: getAutomationGroups().filter(g => used.has(g.id)),
        aliases,
        triggers,
    };
}

export function parsePack(text: string): AutomationPack {
    const value = JSON.parse(text);
    if (!value || value.format !== PACK_FORMAT || !Array.isArray(value.aliases) || !Array.isArray(value.triggers)) {
        throw new Error("To nie jest plik automatyzacji z tego klienta.");
    }
    return { ...value, groups: Array.isArray(value.groups) ? value.groups : [] };
}

/**
 * Adds a pack to what is stored. Its groups are matched to existing ones by
 * name; everything gets new ids, so importing the same file twice never
 * overwrites. An alias whose pattern already exists is skipped, and so is a
 * trigger identical to one already there.
 */
export function importPack(pack: AutomationPack): { aliases: number; triggers: number; skipped: number } {
    const groupIds = new Map<string, string>();
    for (const g of pack.groups) {
        const id = ensureAutomationGroup(g.name);
        if (id) groupIds.set(g.id, id);
    }
    const remap = <T extends UserAlias | UserTrigger>(item: T): T => {
        const { group, ...rest } = item;
        const mapped = group ? groupIds.get(group) : undefined;
        return { ...rest, id: newAutomationId(), ...(mapped ? { group: mapped } : {}) } as T;
    };
    let skipped = 0;

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
    const newTriggers = normalizeTriggerList(pack.triggers).filter(t => {
        const dup = known.has(shape(t));
        if (dup) skipped++;
        return !dup;
    }).map(remap);
    if (newTriggers.length) globalStorage.set("triggers", normalizeTriggerList([...triggers, ...newTriggers]));

    return { aliases: newAliases.length, triggers: newTriggers.length, skipped };
}

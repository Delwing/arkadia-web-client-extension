import { globalStorage } from "@modules/core/storage";
import { newAutomationId } from "@modules/core/automation.ts";
import type { UserTrigger } from "@client/scripts/userTriggers.ts";
import type { Alias } from "@web/options/importBlowtorch.ts";
import { normalizeTriggerList } from "@web/options/userTriggerNormalize.ts";

/** Adds aliases whose pattern isn't there yet; returns how many were added. */
export function addAliases(imported: Alias[]): number {
    const existing = globalStorage.get("aliases");
    const list: Alias[] = Array.isArray(existing) ? existing : [];
    const fresh = imported.filter(a => !list.some(b => b.pattern === a.pattern));
    if (fresh.length) globalStorage.set("aliases", [...list, ...fresh]);
    return fresh.length;
}

const shape = (t: UserTrigger) => JSON.stringify([t.type ?? "pattern", t.pattern ?? "", t.flags ?? "", t.macros]);

/** Adds triggers not already there in the same shape; returns how many were added. */
export function addTriggers(imported: UserTrigger[]): number {
    const existing = globalStorage.get("triggers");
    const list: UserTrigger[] = Array.isArray(existing) ? existing : [];
    const known = new Set(list.map(shape));
    const fresh = imported.filter(t => !known.has(shape(t))).map(t => ({ ...t, id: newAutomationId() }));
    if (fresh.length) globalStorage.set("triggers", normalizeTriggerList([...list, ...fresh]));
    return fresh.length;
}

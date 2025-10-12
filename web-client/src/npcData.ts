import type { NpcDefinition } from "@client/src/runtime/data";

export const NPC_STORAGE_KEY = "npc" as const;

export function normalizeNpcList(value: unknown): NpcDefinition[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((entry): entry is NpcDefinition => Boolean(entry && typeof entry === "object"))
        .map((entry) => ({
            name: String((entry as NpcDefinition).name ?? ""),
            loc: Number((entry as NpcDefinition).loc ?? (entry as any).loc),
        }))
        .filter((entry) => entry.name.length > 0 && Number.isFinite(entry.loc));
}

export function areNpcEntriesEqual(a: NpcDefinition, b: NpcDefinition): boolean {
    return a.name === b.name && a.loc === b.loc;
}

export function npcListsEqual(
    a: readonly NpcDefinition[],
    b: readonly NpcDefinition[],
): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i += 1) {
        if (!areNpcEntriesEqual(a[i], b[i])) {
            return false;
        }
    }

    return true;
}

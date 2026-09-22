/**
 * The part every automation element shares, whatever starts it.
 *
 * Aliases and triggers (and later timers and scripts) differ only in their
 * source; the name, the group, the on/off switch and the characters an element
 * applies to work the same for all of them. Every field is optional so data
 * written before these existed, or by writers that do not know about them (the
 * assistant, imports, an older client syncing the same keys), stays valid: an
 * element without them is on, ungrouped and applies to every character.
 */
import { characterStorage, globalStorage } from "@modules/core/storage";

export interface AutomationMeta {
    /** Stable identity for selecting and sharing an element. Assigned on first save. */
    id?: string;
    /** Optional label; the list falls back to the pattern or event. */
    name?: string;
    /** Id of an `AutomationGroup`. */
    group?: string;
    /** Absent means on. */
    enabled?: boolean;
    /** Characters the element applies to. Absent or empty means all of them. */
    characters?: string[];
}

export interface AutomationGroup {
    id: string;
    name: string;
    /** Absent means on. Switching a group off switches off everything in it. */
    enabled?: boolean;
}

export const AUTOMATION_GROUPS_KEY = "automationGroups";

export function newAutomationId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function withAutomationId<T extends AutomationMeta>(item: T): T {
    return item.id ? item : { ...item, id: newAutomationId() };
}

export function getAutomationGroups(): AutomationGroup[] {
    const value = globalStorage.get(AUTOMATION_GROUPS_KEY);
    return Array.isArray(value) ? value : [];
}

export function saveAutomationGroups(groups: AutomationGroup[]): void {
    globalStorage.set(AUTOMATION_GROUPS_KEY, groups);
}

/**
 * Id of the group named `name`, creating it when there is none. Names match
 * ignoring case and surrounding spaces; an empty name means no group.
 */
export function ensureAutomationGroup(name: string): string | undefined {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const groups = getAutomationGroups();
    const existing = groups.find(g => g.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const group: AutomationGroup = { id: newAutomationId(), name: trimmed };
    saveAutomationGroups([...groups, group]);
    return group.id;
}

export function automationGroupName(id: string | undefined, groups = getAutomationGroups()): string {
    if (!id) return "";
    return groups.find(g => g.id === id)?.name ?? "";
}

/**
 * Whether an element should run right now.
 *
 * A group id with no matching group (its record did not sync yet, or was
 * deleted) does not switch the element off: losing the group should not
 * silently disable what was in it. An element limited to some characters is
 * off while no character is logged in.
 */
export function isAutomationActive(
    item: AutomationMeta,
    groups: AutomationGroup[],
    character: string | null,
): boolean {
    if (item.enabled === false) return false;
    if (item.group && groups.find(g => g.id === item.group)?.enabled === false) return false;
    if (item.characters?.length) {
        if (!character) return false;
        const lower = character.toLowerCase();
        if (!item.characters.some(c => c.toLowerCase() === lower)) return false;
    }
    return true;
}

/** `isAutomationActive` against the stored groups and the logged-in character. */
export function isAutomationActiveNow(item: AutomationMeta): boolean {
    return isAutomationActive(item, getAutomationGroups(), characterStorage.getCharacter());
}

/**
 * Calls `onChange` whenever what `isAutomationActiveNow` answers may have
 * changed: a group was switched, or another character logged in.
 */
export function onAutomationScopeChange(onChange: () => void): () => void {
    const offGroups = globalStorage.onChange(AUTOMATION_GROUPS_KEY, () => onChange());
    const offCharacter = characterStorage.onCharacterChange(() => onChange());
    return () => {
        offGroups();
        offCharacter();
    };
}

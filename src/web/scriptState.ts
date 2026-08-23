import { getScriptRegistry } from '@client/main';

/**
 * Whether a feature script is running right now.
 *
 * UI that exists only to reach a script — a context-menu entry, a footer button —
 * asks this before showing itself. A script the user turned off takes its aliases
 * and triggers with it, so an entry that survived it would be a door onto an empty
 * room: see docs/SCRIPT_DEPENDENCIES.md, *Decisions* §2.
 *
 * Unknown counts as running. Before bootstrap there is no registry and no menu
 * either, so the only thing defaulting the other way could achieve is hiding a
 * whole menu because it was built a moment too early.
 */
export function isScriptRunning(id: string): boolean {
    const registry = getScriptRegistry();
    return registry ? registry.isRunning(id) : true;
}

/** Keep the entries whose owning script is running. */
export function ownedByRunning<T extends { owner?: string }>(entries: T[]): T[] {
    return entries.filter(entry => !entry.owner || isScriptRunning(entry.owner));
}

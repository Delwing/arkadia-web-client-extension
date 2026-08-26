/**
 * Normalisers applied to a `UserTrigger` before it is written to the `triggers`
 * storage key.
 *
 * These lived as module-private functions inside `UserTriggers.tsx`. They moved
 * here when the AI assistant gained its own write path: two writers normalising
 * differently is exactly how the settings UI and the assistant would drift
 * apart, and a copy-paste would have made this the third copy of
 * `normalizeMacro` in the tree.
 *
 * They are structurally generic on purpose. Two independent declarations of
 * `UserMacro`/`UserTrigger` exist — the runtime one in
 * `@client/scripts/userTriggers` and the UI one in `UserTriggers.tsx` — and
 * they differ slightly (the UI copy allows an extra `dimEasing` value). Being
 * generic lets both call these without a cast and without either type winning.
 */

interface MacroLike {
    type: string;
    soundKey?: string;
}

interface TriggerLike<M extends MacroLike> {
    macros: M[];
}

/**
 * A `beep` macro with no `soundKey` plays nothing at all, so the trigger looks
 * broken rather than silent. Default it the way the editor does.
 */
export function normalizeMacro<M extends MacroLike>(macro: M): M {
    if (macro.type === 'beep' && (!macro.soundKey || typeof macro.soundKey !== 'string')) {
        return { ...macro, soundKey: 'beep' } as M;
    }
    return macro;
}

export function normalizeTrigger<M extends MacroLike, T extends TriggerLike<M>>(trigger: T): T {
    const macros = Array.isArray(trigger.macros) ? trigger.macros.map(normalizeMacro) : [];
    return { ...trigger, macros };
}

export function normalizeTriggerList<M extends MacroLike, T extends TriggerLike<M>>(
    list: T[] = [],
): T[] {
    return list.map(trigger => normalizeTrigger<M, T>(trigger));
}

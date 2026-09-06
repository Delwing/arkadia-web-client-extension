import { AnsiAwareBuffer } from "../ansi/FormatState";

/**
 * Duplication rules for lines that get redirected away from the main window.
 *
 * A redirect (currently the combat window) swallows every line of its message
 * types, which also hides messages you still want to see while looking at the
 * main output — losing your weapon, being able to draw it again. Instead of
 * teaching every producer of such a line about the redirect, the redirect asks
 * this registry whether the line it is about to delete should be echoed back to
 * the main window. The redirect itself is unchanged: the line still lands in
 * the popup and is still deleted from the main output; the copy is a separate
 * message printed after it.
 *
 * Matching runs on the line as the redirect sees it — i.e. after gags and
 * colouring have rewritten it — so rules match the decorated text (`[ BRON ]`)
 * rather than the raw game output.
 */
export type DuplicateToMainRule = {
    /** Identifies the rule so it can be replaced or removed. */
    tag: string;
    /** Claims a redirected line: a pattern on its text, or a custom predicate. */
    match: RegExp | ((line: AnsiAwareBuffer, type: string) => boolean);
    /**
     * Builds what the main window shows. Defaults to a copy of the redirected
     * line; return null to print nothing.
     */
    render?: (line: AnsiAwareBuffer, type: string) => AnsiAwareBuffer | string | null;
};

const DEFAULT_RULES: DuplicateToMainRule[] = [
    {
        // Weapon knocked off / can be drawn again. Emitted by the `color_other`
        // Lua gags and by the magic-disarm triggers in `spells.ts`; both label
        // the line `[ BRON ]`, the spell counterpart `[ MOZESZ DOBYWAC ]`.
        tag: "weapon-knock-off",
        match: /\[\s+(?:BRON|MOZESZ DOBYWAC)\s+\]/,
    },
];

let rules: DuplicateToMainRule[] = [...DEFAULT_RULES];

/** Adds a rule, replacing any earlier rule carrying the same tag. */
export function registerDuplicateToMain(rule: DuplicateToMainRule): void {
    rules = rules.filter(existing => existing.tag !== rule.tag);
    rules.push(rule);
}

/** Drops the rule with this tag. */
export function unregisterDuplicateToMain(tag: string): void {
    rules = rules.filter(existing => existing.tag !== tag);
}

export function getDuplicateToMainRules(): DuplicateToMainRule[] {
    return [...rules];
}

/** Restores the built-in rules. Used by tests. */
export function resetDuplicateToMainRules(): void {
    rules = [...DEFAULT_RULES];
}

/**
 * Returns what a redirect should print to the main window for `line`, or null
 * when the line is not duplicated.
 */
export function resolveDuplicateToMain(
    line: AnsiAwareBuffer,
    type: string,
): AnsiAwareBuffer | string | null {
    for (const rule of rules) {
        const matched = typeof rule.match === "function"
            ? rule.match(line, type)
            : rule.match.test(line.text);
        if (!matched) continue;
        // clone() so the copy is independent of the buffer the redirect keeps
        // and of the deletion the redirect is about to mark on it.
        return rule.render ? rule.render(line, type) : line.clone();
    }
    return null;
}

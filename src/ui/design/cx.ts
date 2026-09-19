/**
 * Class-name join. Falsy entries drop out, so conditional classes read as
 * `cond && "ark-x"` at the call site.
 *
 * Deliberately not a dependency: this is the whole of what `clsx` would give
 * us here, and the design system has no runtime deps beyond React and Radix.
 */
export type ClassValue = string | false | null | undefined;

export function cx(...parts: ClassValue[]): string {
    let out = "";
    for (const part of parts) {
        if (!part) continue;
        out = out ? `${out} ${part}` : part;
    }
    return out;
}

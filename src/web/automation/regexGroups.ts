/**
 * Where the capture groups of a pattern are, so the editor can give each one a
 * colour and show the same colour wherever the group is used: in the pattern,
 * on the test chips, on the insert buttons. Also which group tokens in an
 * action's text point at nothing.
 */
import type { UserMacro } from "@client/scripts/userTriggers";

export interface RegexGroup {
    /** 1-based, as in `$1`. */
    index: number;
    name?: string;
    /** Offset of the opening `(`. */
    start: number;
    /** Offset just past the closing `)`; the pattern's length when unclosed. */
    end: number;
    /** 0 for a group not inside another capture group. */
    depth: number;
}

/** How many group colours there are; group 7 takes the first one again. */
export const GROUP_COLORS = 6;

/** The colour class of group `index`. */
export function groupColorClass(index: number): string {
    return `automation-g${((index - 1) % GROUP_COLORS) + 1}`;
}

/**
 * The capture groups of a pattern in order of their opening bracket, which is
 * also their number. Skips escaped brackets, brackets inside `[...]` and the
 * non-capturing kinds (`(?:`, lookarounds). Does not check the pattern compiles.
 */
export function patternGroups(pattern: string): RegexGroup[] {
    const groups: RegexGroup[] = [];
    // One entry per open bracket; null for the non-capturing ones.
    const open: (RegexGroup | null)[] = [];
    let inClass = false;
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === "\\") {
            i++;
            continue;
        }
        if (inClass) {
            if (c === "]") inClass = false;
            continue;
        }
        if (c === "[") {
            inClass = true;
        } else if (c === "(") {
            const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(pattern.slice(i));
            if (pattern[i + 1] === "?" && !named) {
                open.push(null);
                continue;
            }
            const group: RegexGroup = {
                index: groups.length + 1,
                start: i,
                end: pattern.length,
                depth: open.filter(Boolean).length,
                ...(named ? { name: named[1] } : {}),
            };
            groups.push(group);
            open.push(group);
        } else if (c === ")") {
            const group = open.pop();
            if (group) group.end = i + 1;
        }
    }
    return groups;
}

/** A stretch of text that belongs to group `index`: a group in the pattern, or what it took from a test line. */
export interface GroupRange {
    index: number;
    name?: string;
    start: number;
    end: number;
}

/** A piece of text for drawing it: plain, or a group with its own pieces inside. */
export type TextPiece = { text: string } | { group: GroupRange; pieces: TextPiece[] };

/** Whether `outer` holds `inner`; of two over the same text, the lower number holds the higher. */
function holds(outer: GroupRange, inner: GroupRange): boolean {
    if (outer === inner || outer.start > inner.start || inner.end > outer.end) return false;
    return outer.start < inner.start || inner.end < outer.end || outer.index < inner.index;
}

/** `text` split into nested pieces along the ranges. Empty ranges are left out. */
export function textPieces(text: string, ranges: GroupRange[]): TextPiece[] {
    const build = (from: number, to: number, inside: GroupRange[]): TextPiece[] => {
        const pieces: TextPiece[] = [];
        let at = from;
        // Only the outermost ranges here; the rest go one level down.
        const top = inside.filter(g => !inside.some(o => holds(o, g))).sort((a, b) => a.start - b.start);
        for (const g of top) {
            if (g.start < at) continue;
            if (g.start > at) pieces.push({ text: text.slice(at, g.start) });
            pieces.push({ group: g, pieces: build(g.start, g.end, inside.filter(o => holds(g, o))) });
            at = g.end;
        }
        if (at < to) pieces.push({ text: text.slice(at, to) });
        return pieces;
    };
    return build(0, text.length, ranges.filter(r => r.end > r.start));
}

/**
 * What each group took from the text, over every match. Needs matches made
 * with the `d` flag; without it there is nothing to say where a group was.
 */
export function matchRanges(matches: RegExpMatchArray[], groups: RegexGroup[]): GroupRange[] {
    return matches.flatMap(m => groups.flatMap(g => {
        // The `d` flag's positions; not in the TypeScript lib this project targets.
        const at = (m as RegExpMatchArray & { indices?: ([number, number] | undefined)[] }).indices?.[g.index];
        return at ? [{ index: g.index, name: g.name, start: at[0], end: at[1] }] : [];
    }));
}

/** Insert buttons for the groups: `$1` for each, plus `{name}` beside it for a named one, in the group's colour. */
export function groupPlaceholders(groups: RegexGroup[]): { token: string; label: string; className: string }[] {
    return groups.flatMap(g => {
        const className = groupColorClass(g.index);
        const label = `Grupa ${g.index} z wzorca${g.name ? ` (${g.name})` : ""}`;
        const byNumber = { token: `$${g.index}`, label, className };
        return g.name ? [byNumber, { token: `{${g.name}}`, label, className }] : [byNumber];
    });
}

/** The group a `$1`, `{1}` or `{name}` token stands for, if the pattern has it. */
export function groupOfToken(token: string, groups: RegexGroup[]): RegexGroup | undefined {
    const n = /^(?:\$(\d+)|\{(\d+)\})$/.exec(token);
    if (n) return groups.find(g => g.index === Number(n[1] ?? n[2]));
    const name = /^\{([A-Za-z_$][\w$]*)\}$/.exec(token)?.[1];
    return name ? groups.find(g => g.name === name) : undefined;
}

/**
 * Group tokens in `text` that point at no group: `$3` when the pattern has
 * two, `{cel}` when no group is named so. `$0` / `{0}` (the whole match) is
 * always there. Each token once, in order of appearance.
 */
export function unknownGroupTokens(text: string, groups: RegexGroup[]): string[] {
    const found = new Set<string>();
    for (const m of text.matchAll(/\$(\d+)|\{(\d+|[A-Za-z_$][\w$]*)\}/g)) {
        const token = m[0];
        if (m[1] === "0" || m[2] === "0") continue;
        if (!groupOfToken(token, groups)) found.add(token);
    }
    return [...found];
}

/** The text fields of an action that may hold `$1` / `{name}` tokens. */
export function macroTexts(m: UserMacro): string[] {
    return [m.command, m.message, m.label, m.to, m.wrapPrefix, m.wrapSuffix, m.notifyTitle].filter((t): t is string => !!t);
}

/** Why a group token points at nothing, for a pattern with `n` groups. */
export function missingGroupWhy(n: number): string {
    if (!n) return "- wzorzec nie ma grup w nawiasach.";
    const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20);
    return `- wzorzec ma tylko ${n === 1 ? "1 grupę" : `${n} ${few ? "grupy" : "grup"}`}.`;
}

/**
 * `{name}` tokens in `text` that are not one of `names`: an event trigger's
 * text using a field its event does not carry.
 */
export function unknownArgTokens(text: string, names: string[]): string[] {
    const found = new Set<string>();
    for (const m of text.matchAll(/\{([A-Za-z_$][\w$]*)\}/g)) {
        if (!names.includes(m[1])) found.add(m[0]);
    }
    return [...found];
}

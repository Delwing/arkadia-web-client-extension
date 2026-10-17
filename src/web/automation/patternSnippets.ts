/**
 * Ready pieces of a pattern the editor inserts at the caret, so a player who
 * does not write regular expressions can still capture "a word" or "any
 * text". A capture replaces the selection: select `goblina` in `zab goblina`,
 * pick Słowo, and it becomes `zab ([\w-]+)`.
 *
 * All ASCII on purpose: patterns never carry Polish letters, and the game's
 * text has none either.
 */
import { patternGroups } from "./regexGroups";

/** The pattern after an insert, and what to select in it (start = end: just the caret). */
export interface SnippetResult {
    value: string;
    selStart: number;
    selEnd: number;
}

export interface PatternSnippet {
    id: string;
    label: string;
    /** What it inserts, as shown in the menu. */
    shown: string;
    /** What it matches, in a few words. */
    detail: string;
    kind: "capture" | "helper" | "anchor";
    /** Offered only there: `$i` exists only in aliases, and an alias always matches the whole command. */
    only?: "alias" | "trigger";
    apply(value: string, start: number, end: number): SnippetResult;
}

/** Puts `text` in place of [start, end) and leaves the caret after it. */
function replaceWith(text: string) {
    return (value: string, start: number, end: number): SnippetResult => {
        const at = start + text.length;
        return { value: value.slice(0, start) + text + value.slice(end), selStart: at, selEnd: at };
    };
}

/**
 * Wraps the selection in `open` ... `close`. With nothing selected, the caret
 * goes where the selection would have been; with a selection, `caretAt` says
 * where (an offset from the end of the inserted text).
 */
function wrap(open: string, close: string, caretFromEnd = 0) {
    return (value: string, start: number, end: number): SnippetResult => {
        const inner = value.slice(start, end);
        const next = value.slice(0, start) + open + inner + close + value.slice(end);
        const at = inner ? start + open.length + inner.length + close.length - caretFromEnd : start + open.length;
        return { value: next, selStart: at, selEnd: at };
    };
}

export const PATTERN_SNIPPETS: PatternSnippet[] = [
    { id: "word", kind: "capture", label: "Słowo", shown: "([\\w-]+)", detail: "goblina, bialo-kremowa", apply: replaceWith("([\\w-]+)") },
    { id: "text", kind: "capture", label: "Dowolny tekst", shown: "(.+)", detail: "wszystko do końca", apply: replaceWith("(.+)") },
    {
        id: "textUntil",
        kind: "capture",
        label: "Tekst do...",
        shown: "(.+?)",
        detail: "jak najmniej, do tego, co jest dalej: ^(.+?) atakuje cie",
        apply: replaceWith("(.+?)"),
    },
    { id: "number", kind: "capture", label: "Liczba", shown: "(\\d+)", detail: "3, 120", apply: replaceWith("(\\d+)") },
    {
        id: "range",
        kind: "capture",
        only: "alias",
        label: "Zakres",
        shown: "(\\d+(?:-\\d+)?)",
        detail: "3 albo 1-7 - $i w komendzie powtórzy ją dla każdej liczby",
        apply: replaceWith("(\\d+(?:-\\d+)?)"),
    },
    { id: "name", kind: "capture", label: "Imię", shown: "([A-Z][a-z]+)", detail: "Dargoth - z wielkiej litery, jak imiona graczy", apply: replaceWith("([A-Z][a-z]+)") },
    {
        id: "short",
        kind: "capture",
        label: "Krótki opis (3 słowa)",
        shown: "([\\w-]+ [\\w-]+ [\\w-]+)",
        detail: "wysoki muskularny elf, bialo-kremowa smocza fajka",
        apply: replaceWith("([\\w-]+ [\\w-]+ [\\w-]+)"),
    },
    { id: "description", kind: "capture", label: "Opis", shown: "([\\w -]+?)", detail: "kilka słów: wysoki elf, smocza fajka", apply: replaceWith("([\\w -]+?)") },
    {
        id: "named",
        kind: "helper",
        label: "Nazwana grupa",
        shown: "(?<nazwa>...)",
        detail: "w akcji jako {nazwa}",
        apply: (value, start, end) => {
            const inner = value.slice(start, end) || ".+";
            const nameAt = start + 3;
            return { value: `${value.slice(0, start)}(?<nazwa>${inner})${value.slice(end)}`, selStart: nameAt, selEnd: nameAt + 5 };
        },
    },
    { id: "oneOf", kind: "helper", label: "Jedno z", shown: "(?:a|b)", detail: "atakuje albo uderza - nie trafia do grupy", apply: wrap("(?:", "|)", 1) },
    { id: "optional", kind: "helper", label: "Opcjonalnie", shown: "(?:...)?", detail: "fragment, którego może nie być", apply: wrap("(?:", ")?") },
    {
        id: "lineStart",
        kind: "anchor",
        only: "trigger",
        label: "Początek linii",
        shown: "^",
        detail: "linia musi się tak zaczynać",
        apply: (value, start, end) => value.startsWith("^")
            ? { value, selStart: start, selEnd: end }
            : { value: `^${value}`, selStart: start + 1, selEnd: end + 1 },
    },
    {
        id: "lineEnd",
        kind: "anchor",
        only: "trigger",
        label: "Koniec linii",
        shown: "$",
        detail: "linia musi się tak kończyć",
        apply: (value, start, end) => endsWithAnchor(value)
            ? { value, selStart: start, selEnd: end }
            : { value: `${value}$`, selStart: start, selEnd: end },
    },
    {
        id: "dotEnd",
        kind: "anchor",
        only: "trigger",
        label: "Kropka na końcu",
        shown: "\\.$",
        detail: "linie gry zwykle kończą się kropką",
        apply: (value, start, end) => {
            let base = endsWithAnchor(value) ? value.slice(0, -1) : value;
            if (base.endsWith("\\.")) base = base.slice(0, -2);
            else if (base.endsWith(".") && !base.endsWith("\\.")) base = base.slice(0, -1);
            const next = `${base}\\.$`;
            return { value: next, selStart: Math.min(start, base.length), selEnd: Math.min(end, base.length) };
        },
    },
];

/** A `$` at the end that is the anchor, not an escaped dollar. */
function endsWithAnchor(value: string): boolean {
    return value.endsWith("$") && !/(^|[^\\])(\\\\)*\\\$$/.test(value);
}

/** The number a capture inserted at `start` would get: one more than the groups opened before it. */
export function nextGroupIndex(value: string, start: number): number {
    return patternGroups(value).filter(g => g.start < start).length + 1;
}

/** `text` with every regex special character escaped, so it matches itself. */
export function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A pattern that matches exactly this line: escaped, and for a trigger held
 * to the whole line with `^...$` (an alias always matches the whole command).
 */
export function patternFromText(text: string, anchored: boolean): string {
    const escaped = escapeRegex(text.trim());
    return anchored ? `^${escaped}$` : escaped;
}

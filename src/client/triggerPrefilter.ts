/**
 * Literal prefilter for regex triggers. On by default; the `triggerPrefilter`
 * behaviour setting (Ustawienia > Inne > Filtr triggerÃ³w) switches it off or to verify.
 *
 * Every line runs every regex trigger, and most of those regexes (~95% of what the
 * stock scripts and the Mudlet-synced gags register) contain a run of plain text that
 * every match has to include: `(?<name>.*) atakuje cie!` cannot match a line without
 * " atakuje cie!". A `String.includes` for that text is far cheaper than running the
 * regex, and when it fails the regex cannot match, so the regex is skipped. Trigger
 * order, callbacks and match results are unchanged; a regex we cannot analyse simply
 * has no prefilter and always runs.
 *
 * The extractor is deliberately conservative. It only reads the top level of the
 * pattern: groups, character classes, escapes like `\d`, and anything optional or
 * repeated end the current run; a top-level `|` means nothing is required at all.
 */

export interface Prefilter {
    /** As extracted from the source, for reports: one literal, or alternatives joined by " | ". */
    raw: string;
    /** What is searched for, any one of which suffices: lowercased when the regex is case-insensitive. */
    literals: string[];
    caseInsensitive: boolean;
}

/** A line a regex matched although its prefilter would have skipped it: an extractor bug. */
export interface PrefilterMiss {
    trigger: string;
    source: string;
    flags: string;
    literal: string;
    line: string;
}

/** Keeps the first misses for inspection; enough to spot a pattern without growing forever. */
const MAX_KEPT_MISSES = 200;

/** Shortest literal worth checking; shorter ones rule out too few lines to pay for the check. */
const MIN_LITERAL_LENGTH = 3;

const cache = new WeakMap<RegExp, Prefilter | null>();

/**
 * The longest run of literal text every match of `source` must contain, or null when
 * there is none (or the pattern uses something the extractor does not handle).
 */
export function requiredLiteral(source: string, flags = ""): string | null {
    // Sticky matching depends on lastIndex; `iu`/`iv` case folding maps characters
    // (long s, Kelvin sign) that toLowerCase does not, so a lowercase compare could miss.
    if (flags.includes("y")) return null;
    if (flags.includes("i") && (flags.includes("u") || flags.includes("v"))) return null;

    let best = "";
    let run = "";
    const flush = () => {
        if (run.length > best.length) best = run;
        run = "";
    };
    const isQuantifierAt = (j: number): boolean => {
        const c = source[j];
        return c === "*" || c === "+" || c === "?" || (c === "{" && /^\{\d+(,\d*)?\}/.test(source.slice(j)));
    };
    const skipClass = (j: number): number => {
        // j points at "[": returns the index after the matching "]", or -1.
        j++;
        if (source[j] === "^") j++;
        if (source[j] === "]") j++;
        while (j < source.length && source[j] !== "]") {
            if (source[j] === "\\") j++;
            j++;
        }
        return j < source.length ? j + 1 : -1;
    };

    let i = 0;
    while (i < source.length) {
        const c = source[i];
        // The literal character this atom contributes, or null for anything else.
        let atom: string | null = null;
        let next: number;
        if (c === "\\") {
            const d = source[i + 1];
            if (d === undefined) return null;
            if (/[A-Za-z0-9]/.test(d)) {
                // \d \w \s \b, backreferences, \n... end the run. Escapes that take
                // an argument (\u{..}, \x.., \cX, \k<..>, \p{..}) are not worth parsing.
                if ("uxckpP".includes(d)) return null;
            } else {
                atom = d;
            }
            next = i + 2;
        } else if (c === "[") {
            next = skipClass(i);
            if (next === -1) return null;
        } else if (c === "(") {
            let depth = 0;
            let j = i;
            for (; j < source.length; j++) {
                const x = source[j];
                if (x === "\\") {
                    j++;
                } else if (x === "[") {
                    const end = skipClass(j);
                    if (end === -1) return null;
                    j = end - 1;
                } else if (x === "(") {
                    depth++;
                } else if (x === ")") {
                    depth--;
                    if (depth === 0) break;
                }
            }
            if (j >= source.length) return null;
            next = j + 1;
        } else if (c === "|" || c === ")") {
            return null;
        } else if (c === "." || c === "^" || c === "$") {
            next = i + 1;
        } else if (isQuantifierAt(i)) {
            return null;
        } else {
            atom = c;
            next = i + 1;
        }

        if (isQuantifierAt(next)) {
            // A quantified atom may be absent (?, *, {0,n}) or repeat (+, {n,}): at best
            // one copy is required, and nothing after it can extend the same run.
            const min = source[next] === "+"
                ? 1
                : source[next] === "{" ? Number(/^\{(\d+)/.exec(source.slice(next))![1]) : 0;
            if (atom !== null && min >= 1) run += atom;
            flush();
            let j = next;
            if (source[j] === "{") j = source.indexOf("}", j) + 1;
            else j++;
            if (source[j] === "?") j++;
            i = j;
            continue;
        }

        if (atom !== null) run += atom;
        else flush();
        i = next;
    }
    flush();
    return best.length >= MIN_LITERAL_LENGTH ? best : null;
}

/** Most alternatives a prefilter may list; past that the check stops paying for itself. */
const MAX_ALTERNATIVES = 16;

/**
 * Text every match of `source` must contain, as alternatives any one of which is
 * required: `["Lekko ranisz", "Ranisz"]` for `^(Lekko ranisz|Ranisz) `. Null when nothing
 * is provably required.
 *
 * Where {@link requiredLiteral} finds a run of plain text, that run is the answer. Only
 * when it finds none does this look further, into alternations and groups the run
 * extraction treats as opaque - mostly the Mudlet-synced gags, written as
 * `(^[ >]*... text ...)` or `^(?:one phrase|another phrase)`. A group counts only when
 * it must take part in every match: not optional, not a lookaround.
 */
export function requiredLiterals(source: string, flags = ""): string[] | null {
    const literal = requiredLiteral(source, flags);
    if (literal !== null) return [literal];
    if (flags.includes("y")) return null;
    if (flags.includes("i") && (flags.includes("u") || flags.includes("v"))) return null;
    return requirementOf(source);
}

/** Best requirement of a pattern or group body: a union over its top-level branches. */
function requirementOf(source: string): string[] | null {
    const branches = splitTopLevel(source);
    if (branches === null) return null;
    if (branches.length === 1) return requirementOfSequence(branches[0]);
    const union = new Set<string>();
    for (const branch of branches) {
        const required = requirementOfSequence(branch);
        if (required === null) return null;
        required.forEach(l => union.add(l));
        if (union.size > MAX_ALTERNATIVES) return null;
    }
    return [...union];
}

/** A branch without top-level `|`: its own literal run, or the best mandatory group's. */
function requirementOfSequence(source: string): string[] | null {
    const literal = requiredLiteral(source);
    let best: string[] | null = literal !== null ? [literal] : null;
    const score = (r: string[]) => Math.min(...r.map(l => l.length));
    for (const body of mandatoryGroupBodies(source)) {
        const required = requirementOf(body);
        if (required !== null && (best === null || score(required) > score(best))) best = required;
    }
    return best;
}

/** Index after the class starting at `i` ("["), or -1. */
function skipClassAt(source: string, i: number): number {
    let j = i + 1;
    if (source[j] === "^") j++;
    if (source[j] === "]") j++;
    while (j < source.length && source[j] !== "]") {
        if (source[j] === "\\") j++;
        j++;
    }
    return j < source.length ? j + 1 : -1;
}

/** Index of the ")" closing the group opened at `i`, or -1. */
function closeOfGroupAt(source: string, i: number): number {
    let depth = 0;
    for (let j = i; j < source.length; j++) {
        const c = source[j];
        if (c === "\\") {
            j++;
        } else if (c === "[") {
            const end = skipClassAt(source, j);
            if (end === -1) return -1;
            j = end - 1;
        } else if (c === "(") {
            depth++;
        } else if (c === ")") {
            depth--;
            if (depth === 0) return j;
        }
    }
    return -1;
}

/** The top-level `|` branches of `source`, or null when it does not parse. */
function splitTopLevel(source: string): string[] | null {
    const branches: string[] = [];
    let start = 0;
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (c === "\\") {
            i++;
        } else if (c === "[") {
            const end = skipClassAt(source, i);
            if (end === -1) return null;
            i = end - 1;
        } else if (c === "(") {
            const close = closeOfGroupAt(source, i);
            if (close === -1) return null;
            i = close;
        } else if (c === ")") {
            return null;
        } else if (c === "|") {
            branches.push(source.slice(start, i));
            start = i + 1;
        }
    }
    branches.push(source.slice(start));
    return branches;
}

/**
 * Bodies of the top-level groups every match must go through: capturing, `(?:` and
 * named groups that are not optional. Lookarounds and inline-flag groups are skipped.
 */
function mandatoryGroupBodies(source: string): string[] {
    const bodies: string[] = [];
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (c === "\\") {
            i++;
            continue;
        }
        if (c === "[") {
            const end = skipClassAt(source, i);
            if (end === -1) return [];
            i = end - 1;
            continue;
        }
        if (c !== "(") continue;
        const close = closeOfGroupAt(source, i);
        if (close === -1) return [];
        let bodyStart = -1;
        if (source[i + 1] !== "?") {
            bodyStart = i + 1;
        } else if (source[i + 2] === ":") {
            bodyStart = i + 3;
        } else if (source[i + 2] === "<" && source[i + 3] !== "=" && source[i + 3] !== "!") {
            const nameEnd = source.indexOf(">", i);
            if (nameEnd !== -1 && nameEnd < close) bodyStart = nameEnd + 1;
        }
        const q = source[close + 1];
        const optional = q === "?" || q === "*" || (q === "{" && /^\{0[,}]/.test(source.slice(close + 1)));
        if (bodyStart !== -1 && !optional) bodies.push(source.slice(bodyStart, close));
        i = close;
    }
    return bodies;
}

/** The prefilter for `pattern`, or null when it has none. Cached per regex. */
export function prefilterFor(pattern: RegExp): Prefilter | null {
    let entry = cache.get(pattern);
    if (entry === undefined) {
        const required = requiredLiterals(pattern.source, pattern.flags);
        const caseInsensitive = pattern.flags.includes("i");
        if (required === null) {
            entry = null;
        } else {
            const literals = caseInsensitive ? required.map(l => l.toLowerCase()) : required;
            entry = {raw: required.join(" | "), literals, caseInsensitive};
        }
        cache.set(pattern, entry);
    }
    return entry;
}

// Every trigger sees the same plain-line string, so one entry is enough to lowercase
// each line once instead of once per case-insensitive regex.
let lastLine: string | null = null;
let lastLowered = "";

function lowered(line: string): string {
    if (line !== lastLine) {
        lastLine = line;
        lastLowered = line.toLowerCase();
    }
    return lastLowered;
}

/** False only when a regex with this prefilter provably cannot match `line`. */
export function prefilterAllows(prefilter: Prefilter | null, line: string): boolean {
    if (prefilter === null) return true;
    const haystack = prefilter.caseInsensitive ? lowered(line) : line;
    const literals = prefilter.literals;
    for (let i = 0; i < literals.length; i++) {
        if (haystack.includes(literals[i])) return true;
    }
    return false;
}

/** False only when `pattern` provably cannot match `line`. */
export function mayMatch(pattern: RegExp, line: string): boolean {
    return prefilterAllows(prefilterFor(pattern), line);
}

/**
 * Verify mode (`triggerPrefilter: 'verify'`): the prefilter never skips anything, but
 * every regex match is checked against it, so an extractor bug shows up as a loud
 * console error with the regex and the line instead of as a silently missed trigger.
 */
export const prefilterVerifyStats = {checked: 0, misses: 0};
export const prefilterMisses: PrefilterMiss[] = [];
const reportedPerRegex = new WeakMap<RegExp, number>();
const MAX_REPORTS_PER_REGEX = 3;

/** Called after `pattern` matched `line`; reports when the prefilter would have skipped it. */
export function verifyMatch(pattern: RegExp, line: string, describeTrigger: () => string): void {
    prefilterVerifyStats.checked++;
    if (mayMatch(pattern, line)) return;
    prefilterVerifyStats.misses++;
    const trigger = describeTrigger();
    const miss: PrefilterMiss = {
        trigger,
        source: pattern.source,
        flags: pattern.flags,
        literal: prefilterFor(pattern)!.raw,
        line,
    };
    if (prefilterMisses.length < MAX_KEPT_MISSES) prefilterMisses.push(miss);

    const reported = (reportedPerRegex.get(pattern) ?? 0) + 1;
    reportedPerRegex.set(pattern, reported);
    if (reported <= MAX_REPORTS_PER_REGEX) {
        console.error(
            `[triggers] PREFILTER MISS: /${miss.source}/${miss.flags} matched a line without its literal ` +
            `${JSON.stringify(miss.literal)} — with the prefilter on this trigger would not fire.\n` +
            `  trigger: ${trigger}\n  line: ${JSON.stringify(line)}`,
            miss,
        );
    } else if (reported === MAX_REPORTS_PER_REGEX + 1) {
        console.error(`[triggers] PREFILTER MISS: suppressing further reports for /${miss.source}/${miss.flags}`);
    }
}

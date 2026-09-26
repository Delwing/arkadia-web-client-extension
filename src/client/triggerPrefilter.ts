/**
 * Literal prefilter for regex triggers (proof of concept, off by default).
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

interface Prefilter {
    /** As extracted from the source, for reports. */
    raw: string;
    /** What is searched for: lowercased when the regex is case-insensitive. */
    literal: string;
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

function prefilterFor(pattern: RegExp): Prefilter | null {
    let entry = cache.get(pattern);
    if (entry === undefined) {
        const literal = requiredLiteral(pattern.source, pattern.flags);
        const caseInsensitive = pattern.flags.includes("i");
        entry = literal === null
            ? null
            : {raw: literal, literal: caseInsensitive ? literal.toLowerCase() : literal, caseInsensitive};
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

/** False only when `pattern` provably cannot match `line`. */
export function mayMatch(pattern: RegExp, line: string): boolean {
    const prefilter = prefilterFor(pattern);
    if (prefilter === null) return true;
    const haystack = prefilter.caseInsensitive ? lowered(line) : line;
    return haystack.includes(prefilter.literal);
}

/**
 * Verify mode (`?triggerPrefilter=verify`): the prefilter never skips anything, but
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

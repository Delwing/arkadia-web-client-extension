/**
 * Search over log lines.
 *
 * Everything here is pure and synchronous: the viewer calls it on every
 * keystroke (debounced for big logs), and the cross-log counting in All-logs
 * scope calls it once per session. Keeping it free of React makes both cheap to
 * test and cheap to move to a worker later.
 */
import type { LogLine } from "./types";

export interface Matcher {
    regex: RegExp | null;
    /** True when the player typed a regular expression that will not compile. */
    invalid: boolean;
}

export interface MatchSegment {
    text: string;
    match: boolean;
}

export interface SplitResult {
    segments: MatchSegment[];
    count: number;
}

/** Matches per line are capped: one pathological line must not stall a keystroke. */
export const MAX_MATCHES_PER_LINE = 200;

const ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g;

export function makeMatcher(query: string, options: { regex: boolean; caseSensitive: boolean }): Matcher {
    if (!query) return { regex: null, invalid: false };
    const source = options.regex ? query : query.replace(ESCAPE_PATTERN, "\\$&");
    try {
        return { regex: new RegExp(source, options.caseSensitive ? "g" : "gi"), invalid: false };
    } catch {
        return { regex: null, invalid: true };
    }
}

/**
 * Splits a line into alternating plain/highlighted segments.
 *
 * Zero-length matches (`a*`, `^`, lookaheads) are stepped over rather than
 * highlighted: left alone they never advance `lastIndex` and the loop never
 * ends.
 */
export function splitMatches(text: string, regex: RegExp): SplitResult {
    regex.lastIndex = 0;
    const segments: MatchSegment[] = [];
    let last = 0;
    let count = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        if (match[0].length === 0) {
            regex.lastIndex += 1;
            continue;
        }
        if (match.index > last) {
            segments.push({ text: text.slice(last, match.index), match: false });
        }
        segments.push({ text: match[0], match: true });
        last = match.index + match[0].length;
        count += 1;
        if (count >= MAX_MATCHES_PER_LINE) break;
    }

    if (last < text.length) segments.push({ text: text.slice(last), match: false });
    if (segments.length === 0) segments.push({ text, match: false });
    return { segments, count };
}

export function countMatches(text: string, regex: RegExp): number {
    regex.lastIndex = 0;
    let count = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        if (match[0].length === 0) {
            regex.lastIndex += 1;
            continue;
        }
        count += 1;
        if (count >= MAX_MATCHES_PER_LINE) break;
    }
    return count;
}

/** A line with matches on it: its index in the session and how many. */
export interface LineHit {
    line: number;
    count: number;
}

/** A session's text joined into one string, for native `indexOf` over all of it. */
interface TextIndex {
    exact: string;
    /** Null when lowering changed the length, so offsets would not line up. */
    lower: string | null;
    /** Where each line starts in the joined text. */
    starts: number[];
}

// Keyed by the lines array: a session's lines never change once loaded, and a
// reloaded live session comes with a new array.
const textIndexes = new WeakMap<readonly LogLine[], TextIndex>();
const hitCache = new WeakMap<readonly LogLine[], { key: string; hits: LineHit[] }>();

function textIndex(lines: readonly LogLine[]): TextIndex {
    const known = textIndexes.get(lines);
    if (known) return known;
    const starts = new Array<number>(lines.length);
    const texts = new Array<string>(lines.length);
    let offset = 0;
    for (let index = 0; index < lines.length; index += 1) {
        starts[index] = offset;
        texts[index] = lines[index].text;
        offset += lines[index].text.length + 1;
    }
    const exact = texts.join("\n");
    const lowered = exact.toLowerCase();
    const built = { exact, lower: lowered.length === exact.length ? lowered : null, starts };
    textIndexes.set(lines, built);
    return built;
}

/** The line holding `position` in the joined text. */
function lineAt(starts: number[], position: number): number {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (starts[middle] <= position) low = middle;
        else high = middle - 1;
    }
    return low;
}

/**
 * Every line of a session that the query matches, in order.
 *
 * A plain query is found with `indexOf` over the session's joined text, which
 * is many times faster than running a regex line by line; a regular expression
 * still goes line by line, so `^` and `$` keep meaning the line's ends. The
 * result is kept per session until the query or its flags change, so moving
 * between matches, scrolling or filtering channels does not search again.
 */
export function findLineHits(
    lines: readonly LogLine[],
    query: string,
    options: { regex: boolean; caseSensitive: boolean },
    regex: RegExp,
): LineHit[] {
    const key = `${options.regex ? "r" : "p"}${options.caseSensitive ? "c" : "i"}:${query}`;
    const cached = hitCache.get(lines);
    if (cached && cached.key === key) return cached.hits;

    const hits: LineHit[] = [];
    const index = !options.regex && query && !query.includes("\n") ? textIndex(lines) : null;
    const haystack = index ? (options.caseSensitive ? index.exact : index.lower) : null;
    if (index && haystack !== null) {
        const needle = options.caseSensitive ? query : query.toLowerCase();
        let from = 0;
        let current = -1;
        let count = 0;
        for (;;) {
            const at = haystack.indexOf(needle, from);
            if (at === -1) break;
            const line = lineAt(index.starts, at);
            if (line !== current) {
                if (current !== -1) hits.push({ line: current, count });
                current = line;
                count = 0;
            }
            if (count < MAX_MATCHES_PER_LINE) count += 1;
            from = at + needle.length;
        }
        if (current !== -1) hits.push({ line: current, count });
    } else {
        for (let line = 0; line < lines.length; line += 1) {
            const count = countMatches(lines[line].text, regex);
            if (count > 0) hits.push({ line, count });
        }
    }
    hitCache.set(lines, { key, hits });
    return hits;
}

/**
 * Normalises a match index into `[0, total)`.
 *
 * The viewer stores the raw index and lets it run past either end, so that
 * "next past the last" and "previous before the first" are visible to the
 * caller as a wrap rather than silently clamped here.
 */
export function normalizeMatchIndex(index: number, total: number): number {
    if (total <= 0) return 0;
    return ((index % total) + total) % total;
}

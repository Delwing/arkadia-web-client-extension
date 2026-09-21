/**
 * Search over log lines.
 *
 * Everything here is pure and synchronous: the viewer calls it on every
 * keystroke (debounced for big logs), and the cross-log counting in All-logs
 * scope calls it once per session. Keeping it free of React makes both cheap to
 * test and cheap to move to a worker later.
 */

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

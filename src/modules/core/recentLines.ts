/**
 * The last lines the game sent, as they arrived (before any trigger touched
 * them), with their GMCP message type. The trigger editor offers them as test
 * input, so a pattern can be tried on real text instead of retyped text.
 */
export interface RecentLine {
    text: string;
    /** GMCP message type the line came with ('' when none). */
    type: string;
}

const LIMIT = 100;
const lines: RecentLine[] = [];

export function recordRecentLine(text: string, type: string): void {
    if (!text.trim()) return;
    lines.push({ text, type });
    if (lines.length > LIMIT) lines.splice(0, lines.length - LIMIT);
}

/** Newest last. */
export function getRecentLines(): RecentLine[] {
    return lines.slice();
}

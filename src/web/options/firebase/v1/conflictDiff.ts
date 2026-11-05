/**
 * Conflict diff helpers
 *
 * Pure, dependency-free utilities for showing a human-readable diff between the
 * local and cloud versions of a synced category in the conflict modal.
 *
 * Category payloads are JSON, often with nested stringified JSON (e.g. triggers
 * are stored as { triggers: "<stringified array>" }). `expandJsonForDisplay`
 * recursively unwraps those and sorts object keys so the two sides line up,
 * then `diffLines` produces a line-level diff via longest-common-subsequence.
 */

export type DiffLineType = 'context' | 'add' | 'remove';

export interface DiffLine {
    type: DiffLineType;
    text: string;
}

/**
 * Pretty-print a JSON string for display: recursively expand nested stringified
 * JSON and sort object keys so unrelated ordering doesn't show up as a diff.
 * Falls back to the raw string if it isn't valid JSON.
 */
export function expandJsonForDisplay(jsonString: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    } catch {
        return jsonString;
    }
    return JSON.stringify(expandValue(parsed), null, 2);
}

function expandValue(value: unknown): unknown {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return expandValue(JSON.parse(value));
            } catch {
                // Not nested JSON — keep as a plain string
            }
        }
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(expandValue);
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            out[key] = expandValue((value as Record<string, unknown>)[key]);
        }
        return out;
    }
    return value;
}

// Above this many cells the LCS table is skipped in favour of a coarse
// remove-all/add-all diff, to keep huge categories from freezing the UI.
const LCS_CELL_GUARD = 4000 * 4000;

/**
 * Line-level diff between two texts. Common prefix/suffix are matched cheaply,
 * the differing middle via longest-common-subsequence.
 */
export function diffLines(before: string, after: string): DiffLine[] {
    const a = before === '' ? [] : before.split('\n');
    const b = after === '' ? [] : after.split('\n');

    // Match common prefix and suffix to shrink the LCS problem.
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--;
        endB--;
    }

    const result: DiffLine[] = [];
    for (let i = 0; i < start; i++) result.push({ type: 'context', text: a[i] });

    const midA = a.slice(start, endA);
    const midB = b.slice(start, endB);

    if (midA.length * midB.length > LCS_CELL_GUARD) {
        for (const text of midA) result.push({ type: 'remove', text });
        for (const text of midB) result.push({ type: 'add', text });
    } else {
        result.push(...lcsDiff(midA, midB));
    }

    for (let i = endA; i < a.length; i++) result.push({ type: 'context', text: a[i] });
    return result;
}

function lcsDiff(a: string[], b: string[]): DiffLine[] {
    const n = a.length;
    const m = b.length;

    // dp[i][j] = LCS length of a[i:] and b[j:]
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const out: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            out.push({ type: 'context', text: a[i] });
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            out.push({ type: 'remove', text: a[i] });
            i++;
        } else {
            out.push({ type: 'add', text: b[j] });
            j++;
        }
    }
    while (i < n) out.push({ type: 'remove', text: a[i++] });
    while (j < m) out.push({ type: 'add', text: b[j++] });
    return out;
}

export interface DiffSummary {
    added: number;
    removed: number;
}

export function summarizeDiff(lines: DiffLine[]): DiffSummary {
    let added = 0;
    let removed = 0;
    for (const line of lines) {
        if (line.type === 'add') added++;
        else if (line.type === 'remove') removed++;
    }
    return { added, removed };
}

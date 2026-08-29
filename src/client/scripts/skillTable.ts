/**
 * Locate the contiguous run of table rows inside a received frame.
 *
 * A `um` / `jezyki` reply is a block of `nazwa: poziom` rows, but a frame is whatever the
 * game flushed in one go — an arrival, a carriage moving off, anything can ride along with
 * it. Only the rows are this script's to reformat; whatever sits before or after them has
 * to reach the screen exactly as it came in, neither restyled nor dropped.
 *
 * Returns the row range as `[start, end)` line indices, or null when the frame holds no
 * table at all — which means the reply has not arrived yet and the trigger should keep
 * waiting rather than spend its one shot.
 */
export function findTableRange(
    lines: string[],
    isRow: (line: string) => boolean
): { start: number; end: number } | null {
    const start = lines.findIndex(isRow);
    if (start === -1) {
        return null;
    }
    let end = start + 1;
    while (end < lines.length && isRow(lines[end])) {
        end++;
    }
    return { start, end };
}

/** Character offset of line `index` within the frame those lines were split from. */
export function lineOffset(lines: string[], index: number): number {
    let offset = 0;
    for (let i = 0; i < index; i++) {
        offset += lines[i].length + 1;
    }
    return offset;
}

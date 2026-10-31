import type {AnsiAwareBuffer, FormatStateSnapshot} from '@client/ansi/FormatState.ts';

/**
 * Recolours a token trigger's match. A match index is an offset into the line as
 * the MUD sent it, which earlier triggers may have prefixed since; the fallback
 * `indexOf` already searched the current text.
 */
export function recolorToken(
    line: AnsiAwareBuffer,
    matches: RegExpMatchArray,
    color: FormatStateSnapshot,
): void {
    const tokenText = matches[0];
    const fromMatch = typeof matches.index === 'number' && matches.index >= 0;
    const startIndex = fromMatch ? matches.index! : line.text.indexOf(tokenText);
    if (startIndex < 0) {
        return;
    }
    const range = fromMatch
        ? line.mapOriginalRange([startIndex, startIndex + tokenText.length])
        : [startIndex, startIndex + tokenText.length] as [number, number];
    line.replace(range, line.text.slice(range[0], range[1]), color);
}

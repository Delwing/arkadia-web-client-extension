/**
 * Speech hands back the diagonal directions as two words — "polnocny zachod" —
 * because that is how they are said. The game only takes them hyphenated, so
 * the pair is rejoined once everything else has been decided.
 *
 * This runs last, after vocabulary repair: the halves both appear in room exits
 * on screen, so repair leaves them alone and only the spelling needs fixing.
 */

const VERTICAL = new Set(['polnocny', 'poludniowy']);
const HORIZONTAL = new Set(['zachod', 'wschod']);

export function joinCompoundDirections(text: string): string {
    if (!text) return '';

    const tokens = text.split(/\s+/).filter(Boolean);
    const out: string[] = [];

    for (let i = 0; i < tokens.length; ) {
        const next = tokens[i + 1];
        if (next && VERTICAL.has(tokens[i]) && HORIZONTAL.has(next)) {
            out.push(`${tokens[i]}-${next}`);
            i += 2;
        } else {
            out.push(tokens[i]);
            i++;
        }
    }

    return out.join(' ');
}

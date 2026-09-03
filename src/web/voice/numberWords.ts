/**
 * Speech writes small numbers out as words — "wybierz paczke jeden" — while the
 * game wants a digit ("wybierz przesylke 1"). Larger numbers usually come back
 * as digits already, so this covers the range that does not.
 *
 * Gendered forms are folded in (jeden/jedna/jedno, dwa/dwie): the recogniser
 * picks whichever the sentence around it suggests, and all of them mean 1 or 2
 * to the game.
 */

const UNITS: Record<string, number> = {
    zero: 0,
    jeden: 1,
    jedna: 1,
    jedno: 1,
    dwa: 2,
    dwie: 2,
    trzy: 3,
    cztery: 4,
    piec: 5,
    szesc: 6,
    siedem: 7,
    osiem: 8,
    dziewiec: 9,
    dziesiec: 10,
    jedenascie: 11,
    dwanascie: 12,
    trzynascie: 13,
    czternascie: 14,
    pietnascie: 15,
    szesnascie: 16,
    siedemnascie: 17,
    osiemnascie: 18,
    dziewietnascie: 19,
};

const TENS: Record<string, number> = {
    dwadziescia: 20,
    trzydziesci: 30,
    czterdziesci: 40,
    piecdziesiat: 50,
    szescdziesiat: 60,
    siedemdziesiat: 70,
    osiemdziesiat: 80,
    dziewiecdziesiat: 90,
    sto: 100,
};

/**
 * Number words that are also ordinary nouns — "piec" is five, but it is also a
 * stove you might want to light. These only become digits when the word is not
 * among the things currently on screen.
 */
const AMBIGUOUS = new Set(['piec', 'sto']);

/**
 * Turn spoken numbers into digits. `isOnScreen` decides the ambiguous cases;
 * without it they are treated as numbers.
 */
export function spokenNumbersToDigits(text: string, isOnScreen?: (word: string) => boolean): string {
    if (!text) return '';

    const usable = (word: string): boolean => !AMBIGUOUS.has(word) || !isOnScreen?.(word);

    const tokens = text.split(/\s+/).filter(Boolean);
    const out: string[] = [];

    for (let i = 0; i < tokens.length; ) {
        const token = tokens[i];
        const tens = TENS[token];
        const unit = UNITS[token];

        if (tens !== undefined && usable(token)) {
            // "dwadziescia jeden" is one number said as two words.
            const next = tokens[i + 1];
            const trailing = next !== undefined ? UNITS[next] : undefined;
            if (tens < 100 && trailing !== undefined && trailing >= 1 && trailing <= 9 && usable(next)) {
                out.push(String(tens + trailing));
                i += 2;
                continue;
            }
            out.push(String(tens));
            i++;
            continue;
        }

        if (unit !== undefined && usable(token)) {
            out.push(String(unit));
            i++;
            continue;
        }

        out.push(token);
        i++;
    }

    return out.join(' ');
}

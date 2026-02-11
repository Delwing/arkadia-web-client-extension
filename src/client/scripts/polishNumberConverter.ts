/**
 * Polish number words to numeric values converter
 * Used across multiple scripts to parse Polish number words from MUD output
 */

/**
 * Mapping of Polish number words (with various grammatical cases) to numeric values
 */
export const polishNumberWords: Record<string, number> = {
    'jeden': 1, 'jedna': 1, 'jedno': 1,
    'jednego': 1,
    'jednej': 1,
    'dwa': 2, 'dwie': 2,
    'dwoch': 2,
    'trzy': 3,
    'trzech': 3,
    'cztery': 4,
    'czterech': 4,
    'piec': 5,
    'pieciu': 5,
    'szesc': 6,
    'szesciu': 6,
    'siedem': 7,
    'siedmiu': 7,
    'osiem': 8,
    'osmiu': 8,
    'dziewiec': 9,
    'dziewieciu': 9,
    'dziesiec': 10,
    'dziesieciu': 10,
    'jedenascie': 11,
    'jedenastu': 11,
    'dwanascie': 12,
    'dwunastu': 12,
    'trzynascie': 13,
    'trzynastu': 13,
    'czternascie': 14,
    'czternastu': 14,
    'pietnascie': 15,
    'pietnastu': 15,
    'szesnascie': 16,
    'szesnastu': 16,
    'siedemnascie': 17,
    'siedemnastu': 17,
    'osiemnascie': 18,
    'osiemnastu': 18,
    'dziewietnascie': 19,
    'dziewietnastu': 19,
    'dwadziescia': 20,
    'dwudziestu': 20,
    'dwadziescia jeden': 21, 'dwadziescia jedna': 21,
    'dwudziestu jeden': 21,
    'dwadziescia dwa': 22, 'dwadziescia dwie': 22,
    'dwudziestu dwoch': 22,
    'dwadziescia trzy': 23,
    'dwudziestu trzech': 23,
    'dwadziescia cztery': 24,
    'dwudziestu czterech': 24,
    'dwadziescia piec': 25,
    'dwudziestu pieciu': 25,
    'dwadziescia szesc': 26,
    'dwudziestu szesciu': 26,
    'dwadziescia siedem': 27,
    'dwudziestu siedmiu': 27,
    'dwadziescia osiem': 28,
    'dwudziestu osmiu': 28,
    'dwadziescia dziewiec': 29,
    'dwudziestu dziewieciu': 29,
    'trzydziesci': 30,
    'trzydziestu': 30,
    'trzydziesci jeden': 31, 'trzydziesci jedna': 31,
    'trzydziestu jeden': 31,
    'trzydziesci dwa': 32, 'trzydziesci dwie': 32,
    'trzydziestu dwoch': 32,
    'trzydziesci trzy': 33,
    'trzydziestu trzech': 33,
    'trzydziesci cztery': 34,
    'trzydziestu czterech': 34,
    'trzydziesci piec': 35,
    'trzydziestu pieciu': 35,
    'trzydziesci szesc': 36,
    'trzydziestu szesciu': 36,
    'trzydziesci siedem': 37,
    'trzydziestu siedmiu': 37,
    'trzydziesci osiem': 38,
    'trzydziestu osmiu': 38,
    'trzydziesci dziewiec': 39,
    'trzydziestu dziewieciu': 39,
    'czterdziesci': 40,
    'czterdziestu': 40,
    'czterdziesci jeden': 41, 'czterdziesci jedna': 41,
    'czterdziestu jeden': 41,
    'czterdziesci dwa': 42, 'czterdziesci dwie': 42,
    'czterdziestu dwoch': 42,
    'czterdziesci trzy': 43,
    'czterdziestu trzech': 43,
    'czterdziesci cztery': 44,
    'czterdziestu czterech': 44,
    'czterdziesci piec': 45,
    'czterdziestu pieciu': 45,
    'czterdziesci szesc': 46,
    'czterdziestu szesciu': 46,
    'czterdziesci siedem': 47,
    'czterdziestu siedmiu': 47,
    'czterdziesci osiem': 48,
    'czterdziestu osmiu': 48,
    'czterdziesci dziewiec': 49,
    'czterdziestu dziewieciu': 49,
    'piecdziesiat': 50,
    'piecdziesieciu': 50
};

/**
 * Create a regex pattern that matches all Polish number words
 * Sorted by length (descending) to match longer phrases first
 */
export const polishNumberPattern = Object.keys(polishNumberWords)
    .sort((a, b) => b.length - a.length)
    .map(num => num.replace(/\s+/g, '\\s+'))
    .join('|');

/**
 * Convert Polish number word to integer
 * Handles both numeric strings and Polish word forms
 *
 * @param word - The Polish number word or numeric string
 * @returns The numeric value, or 0 if not recognized
 *
 * @example
 * polishWordToNumber('trzy') // returns 3
 * polishWordToNumber('dwadziescia jeden') // returns 21
 * polishWordToNumber('42') // returns 42
 * polishWordToNumber('nieznane') // returns 0
 */
export function polishWordToNumber(word: string): number {
    const trimmed = word.trim().toLowerCase();

    // Handle numeric strings directly
    if (/^\d+$/.test(trimmed)) {
        return parseInt(trimmed, 10);
    }

    // Normalize whitespace for compound numbers
    const normalized = trimmed.replace(/\s+/g, ' ');

    return polishNumberWords[normalized] ?? 0;
}

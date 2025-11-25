/**
 * Calculates normalized Levenshtein distance between two strings.
 * Returns a score from 0 (completely different) to 1 (identical).
 */
export function fuzzyMatchScore(a: string, b: string): number {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    if (aLower === bLower) return 1;
    if (aLower.length === 0 || bLower.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= aLower.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= bLower.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= aLower.length; i++) {
        for (let j = 1; j <= bLower.length; j++) {
            const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    const distance = matrix[aLower.length][bLower.length];
    const maxLength = Math.max(aLower.length, bLower.length);

    return 1 - distance / maxLength;
}

/**
 * Checks if two strings match with at least the given threshold.
 * @param a First string
 * @param b Second string
 * @param threshold Match threshold (0-1), default 0.6
 */
export function fuzzyMatch(a: string, b: string, threshold = 0.6): boolean {
    return fuzzyMatchScore(a, b) >= threshold;
}

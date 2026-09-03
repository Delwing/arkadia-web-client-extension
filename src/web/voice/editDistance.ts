/**
 * Levenshtein distance with an early exit, shared by the two places that need
 * to forgive a misheard word: vocabulary repair and the spoken keywords.
 */
export function boundedDistance(a: string, b: string, limit: number): number {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;

    let previous = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        let rowBest = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
            current.push(value);
            if (value < rowBest) rowBest = value;
        }
        if (rowBest > limit) return limit + 1;
        previous = current;
    }

    return previous[b.length];
}

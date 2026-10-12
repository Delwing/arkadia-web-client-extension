/** One mob's kills on one day, as the lifetime kill store keeps them. */
export interface KillDbEntry {
    mob: string;
    /** "YYYY/M/D", the kill store's date format. */
    date: string;
    count: number;
}

export interface KillDbResult {
    characters: string[];
    byCharacter: Record<string, KillDbEntry[]>;
}

/** A row of Mudlet's `counter2_daysum` table (Database_counterdaysum.db). */
export interface KillDbRow {
    character: unknown;
    year: unknown;
    month: unknown;
    day: unknown;
    type: unknown;
    amount: unknown;
}

/**
 * Turn Mudlet's per-day kill sums into kill store entries, per character.
 *
 * Mudlet also keeps one `all` row per day: the day's total over every
 * character, which is skipped. Its month and day are zero-padded strings
 * ("05"); the store's dates are not. Rows for the same character, mob and day
 * are summed.
 */
export function parseKillRows(rows: Iterable<KillDbRow>): KillDbResult {
    const sums = new Map<string, Map<string, KillDbEntry>>();
    for (const row of rows) {
        const character = String(row.character ?? '').trim();
        const mob = String(row.type ?? '').trim();
        const year = Number(row.year);
        const month = Number(row.month);
        const day = Number(row.day);
        const count = Number(row.amount);
        if (!character || !mob || mob === 'all') continue;
        if (!year || !month || !day || !(count > 0)) continue;

        const date = `${year}/${month}/${day}`;
        let entries = sums.get(character);
        if (!entries) {
            entries = new Map();
            sums.set(character, entries);
        }
        const key = `${mob}\u0000${date}`;
        const entry = entries.get(key);
        if (entry) entry.count += count;
        else entries.set(key, {mob, date, count});
    }

    const characters = [...sums.keys()].sort();
    const byCharacter: Record<string, KillDbEntry[]> = {};
    for (const character of characters) byCharacter[character] = [...sums.get(character)!.values()];
    return {characters, byCharacter};
}

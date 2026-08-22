export interface ComparisonStats {
    sil?: number;
    zre?: number;
    wyt?: number;
}

export const level: Record<string, number> = {
    "rownie dobrze zbudowan": 0,
    "duzo gorzej zbudowan": -5,
    "znacznie gorzej zbudowan": -4,
    "gorzej zbudowan": -3,
    "troche gorzej zbudowan": -2,
    "niewiele gorzej zbudowan": -1,
    "niewiele lepiej zbudowan": 1,
    "troche lepiej zbudowan": 2,
    "lepiej zbudowan": 3,
    "znacznie lepiej zbudowan": 4,
    "duzo lepiej zbudowan": 5,
    "rownie siln": 0,
    "duzo slabsz": -5,
    "znacznie slabsz": -4,
    "slabsz": -3,
    "troche slabsz": -2,
    "niewiele slabsz": -1,
    "duzo mniej siln": -5,
    "znacznie mniej siln": -4,
    "mniej siln": -3,
    "troche mniej siln": -2,
    "niewiele mniej siln": -1,
    "niewiele silniejsz": 1,
    "troche silniejsz": 2,
    "silniejsz": 3,
    "znacznie silniejsz": 4,
    "duzo silniejsz": 5,
    "rownie zreczn": 0,
    "duzo mniej zreczn": -5,
    "znacznie mniej zreczn": -4,
    "mniej zreczn": -3,
    "troche mniej zreczn": -2,
    "niewiele mniej zreczn": -1,
    "niewiele zreczniejsz": 1,
    "troche zreczniejsz": 2,
    "zreczniejsz": 3,
    "znacznie zreczniejsz": 4,
    "duzo zreczniejsz": 5,
};

/**
 * Parse comparison descriptions and return stat differences
 * @param descriptions The comparison text (e.g., "duzo silniejszy, rownie dobrze zbudowany i zreczniejszy")
 * @returns Parsed stats with values (negative = you're stronger, positive = you're weaker)
 */
export function parseComparisonStats(descriptions: string): Partial<ComparisonStats> {
    // Parse the comma/conjunction-separated descriptions
    const parts = descriptions.split(/ i |, /).map(s => s.trim()).filter(Boolean);

    // Sort level entries by description length (longest first) to match most specific first
    const sortedLevelEntries = Object.entries(level).sort((a, b) => b[0].length - a[0].length);

    const parsedStats: Partial<ComparisonStats> = {};

    // Process each description part
    for (const desc of parts) {
        let matchedStat: keyof ComparisonStats | null = null;
        let val = 0;

        // Check for strength-related descriptions
        if (desc.includes("siln")) {
            matchedStat = "sil";
            for (const [levelDesc, levelVal] of sortedLevelEntries) {
                if (levelDesc.includes("siln") && desc.includes(levelDesc)) {
                    val = -levelVal; // Negative because "jestes X" means you are stronger
                    break;
                }
            }
        }
        // Check for dexterity-related descriptions
        else if (desc.includes("zreczn")) {
            matchedStat = "zre";
            for (const [levelDesc, levelVal] of sortedLevelEntries) {
                if (levelDesc.includes("zreczn") && desc.includes(levelDesc)) {
                    val = -levelVal;
                    break;
                }
            }
        }
        // Check for constitution-related descriptions (zbudowany)
        else if (desc.includes("zbudowan")) {
            matchedStat = "wyt";
            for (const [levelDesc, levelVal] of sortedLevelEntries) {
                if (levelDesc.includes("zbudowan") && desc.includes(levelDesc)) {
                    val = -levelVal;
                    break;
                }
            }
        }

        if (matchedStat) {
            parsedStats[matchedStat] = val;
        }
    }

    return parsedStats;
}

const GUILD_CODES_BY_ID: Record<number, string> = {
    1: 'CKN',
    2: 'ES',
    3: 'SC',
    4: 'KS',
    5: 'KM',
    6: 'OS',
    7: 'OHM',
    8: 'SGW',
    9: 'BK',
    10: 'WKS',
    11: 'LE',
    12: 'KG',
    13: 'KGKS',
    14: 'MC',
    15: 'OK',
    16: 'RA',
    17: 'GL',
    18: 'ZT',
    19: 'ZS',
    20: 'ZH',
    21: 'NPC',
    22: 'GP',
};

const DEFAULT_GUILD = 'NPC';

function normalizeGuildString(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return DEFAULT_GUILD;
    }

    const numericValue = Number(trimmed);
    if (!Number.isNaN(numericValue) && Number.isFinite(numericValue)) {
        return GUILD_CODES_BY_ID[numericValue] ?? DEFAULT_GUILD;
    }

    return trimmed;
}

export function resolveGuild(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return GUILD_CODES_BY_ID[value] ?? DEFAULT_GUILD;
    }

    if (typeof value === 'string') {
        return normalizeGuildString(value);
    }

    return DEFAULT_GUILD;
}

export { GUILD_CODES_BY_ID, DEFAULT_GUILD };

/**
 * Mudlet's bank names (scripts.boxes.valid_banks) and the rooms they stand in.
 * Mudlet stores a deposit under the bank's name only - its room_id column is
 * never written - so the room comes from this list.
 */
export const MUDLET_BANK_ROOMS: Readonly<Record<string, number>> = {
    "ebino": 5364,
    "val'kare": 20164,
    "kv": 15395,
    "kraina zgromadzenia": 6739,
    "nuln": 7334,
    "quenelles": 4661,
    "skellige": 10416,
    "baccala": 9776,
    "daevon": 4574,
    "novigrad": 2687,
    "carbon": 1467,
    "wyzima": 316,
    "scala": 893,
    "rinde": 1999,
    "guleta": 8059,
    "parravon": 26630,
};

/** One deposit as Mudlet last saw it. */
export interface DepositDbEntry {
    /** Mudlet's name of the bank ("ebino"). */
    bank: string;
    roomId: number;
    /** The item list as the game prints it; "" for an empty deposit, null when none is bought. */
    content: string | null;
}

export interface DepositDbResult {
    characters: string[];
    byCharacter: Record<string, DepositDbEntry[]>;
    /** Bank names in the file that no room is known for, skipped. */
    unknownBanks: string[];
}

/** A row of Mudlet's `boxes` table (Database_boxestwo.db). */
export interface DepositDbRow {
    character: unknown;
    bank: unknown;
    box: unknown;
}

/**
 * The deposit in a stored `box`. /depozyt saved the whole game line without
 * its full stop ("Twoj depozyt zawiera ...", "Twoj depozyt jest pusty",
 * "Nie posiadasz wykupionego depozytu"); looking into the deposit saved only
 * the item list. undefined when nothing was ever saved.
 */
export function parseDepositBox(box: string): string | null | undefined {
    const text = box.trim().replace(/\.$/, "").trim();
    if (!text) return undefined;
    if (/^Twoj depozyt jest pusty$/.test(text)) return "";
    if (/^Nie posiadasz wykupionego depozytu$/.test(text)) return null;
    return text.replace(/^Twoj depozyt zawiera /, "");
}

export function parseDepositRows(rows: Iterable<DepositDbRow>): DepositDbResult {
    const byCharacter: Record<string, DepositDbEntry[]> = {};
    const unknownBanks = new Set<string>();
    for (const row of rows) {
        const character = String(row.character ?? "").trim();
        const bank = String(row.bank ?? "").trim();
        if (!character || !bank) continue;
        const content = parseDepositBox(String(row.box ?? ""));
        if (content === undefined) continue;
        const roomId = MUDLET_BANK_ROOMS[bank.toLowerCase()];
        if (roomId === undefined) {
            unknownBanks.add(bank);
            continue;
        }
        const entries = byCharacter[character] ??= [];
        const entry = { bank, roomId, content };
        const index = entries.findIndex(e => e.roomId === roomId);
        if (index >= 0) entries[index] = entry;
        else entries.push(entry);
    }
    const characters = Object.keys(byCharacter).sort();
    return { characters, byCharacter, unknownBanks: [...unknownBanks].sort() };
}

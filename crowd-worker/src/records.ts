/**
 * The shape of a crowd record, and its hash.
 *
 * MIRRORED in the client at src/modules/crowd/crowdRecords.ts. The two must
 * produce the same canonical form and the same hash for the same input, or the
 * client's "what is missing" question asks about hashes the Worker never
 * stores, and every sync re-sends everything. Both test suites pin the same
 * hash for the same fixture (see test/records.test.ts) — change one, change
 * both, and update that hash in both.
 *
 * A copy rather than a shared package for the same reason as the push Worker's
 * helpers: the two deploy independently.
 */

export type CrowdKind = 'bron' | 'tarcza' | 'zbroja' | 'odmiana';

export const CROWD_KINDS: readonly CrowdKind[] = ['bron', 'tarcza', 'zbroja', 'odmiana'];

type FieldSpec =
    | { name: string; type: 'text'; max: number; optional?: boolean }
    | { name: string; type: 'int'; max: number };

const SHORT = 200;
const WORD = 100;
const OPIS = 2000;

/**
 * Fields in hash order. Anything a record carries beyond these is dropped, so
 * a player's own `color`, `note` or `roomId` can never reach the Worker even if
 * a client forgets to strip them.
 *
 * Weight, volume, price and the quality ratings are left out on purpose: they
 * come from the evaluating character's skill, so two players describe the same
 * item differently and each would split it into a new version. What is kept is
 * what the item is, not how well someone judged it.
 */
const FIELDS: Record<CrowdKind, readonly FieldSpec[]> = {
    bron: [
        { name: 'short', type: 'text', max: SHORT },
        { name: 'shortAlt', type: 'text', max: SHORT, optional: true },
        { name: 'typ', type: 'text', max: WORD },
        { name: 'rodzaj', type: 'text', max: WORD },
        // Damage types, 0 or 1 each: what the weapon does, not a rating.
        { name: 'klute', type: 'int', max: 1 },
        { name: 'obuch', type: 'int', max: 1 },
        { name: 'ciete', type: 'int', max: 1 },
        { name: 'chwyt', type: 'text', max: WORD },
        { name: 'magik', type: 'int', max: 1 },
        { name: 'srebro', type: 'int', max: 1 },
        { name: 'opis', type: 'text', max: OPIS },
    ],
    tarcza: [
        { name: 'short', type: 'text', max: SHORT },
        { name: 'shortAlt', type: 'text', max: SHORT, optional: true },
        { name: 'magik', type: 'int', max: 1 },
        { name: 'opis', type: 'text', max: OPIS },
        { name: 'oslona', type: 'text', max: WORD },
        { name: 'iLine', type: 'text', max: SHORT, optional: true },
    ],
    zbroja: [
        { name: 'short', type: 'text', max: SHORT },
        { name: 'shortAlt', type: 'text', max: SHORT, optional: true },
        { name: 'typ', type: 'text', max: WORD },
        { name: 'magik', type: 'int', max: 1 },
        { name: 'opis', type: 'text', max: OPIS },
        { name: 'oslona', type: 'text', max: WORD },
        { name: 'iLine', type: 'text', max: SHORT, optional: true },
    ],
    odmiana: [
        { name: 'mianownik', type: 'text', max: SHORT },
        { name: 'dopelniacz', type: 'text', max: SHORT },
        { name: 'celownik', type: 'text', max: SHORT },
        { name: 'biernik', type: 'text', max: SHORT },
        { name: 'narzednik', type: 'text', max: SHORT },
        { name: 'miejscownik', type: 'text', max: SHORT },
    ],
};

/** What versions of a record compete over: one item, one noun phrase. */
const KEY_FIELD: Record<CrowdKind, string> = {
    bron: 'short',
    tarcza: 'short',
    zbroja: 'short',
    odmiana: 'mianownik',
};

/**
 * Carried along but kept out of the hash. One item's description changes with
 * what is set into it ("pozostawiono miejsce na wprawienie" / "wprawiono
 * bardzo maly bezbarwny ..."), so hashing it would split one item into a
 * version per copy, each with one vote. A version keeps the first description
 * sent for it, as a sample.
 */
const SAMPLE_FIELDS = new Set(['opis']);

/** Game text reaches the client ASCII-folded, so anything else did not come from the game. */
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

export interface CrowdRecord {
    kind: CrowdKind;
    key: string;
    /** Fields in hash order, optional ones omitted when absent. */
    payload: Record<string, string | number>;
}

export type CanonicalResult = { ok: true; record: CrowdRecord } | { ok: false; reason: string };

export function isCrowdKind(value: unknown): value is CrowdKind {
    return typeof value === 'string' && (CROWD_KINDS as readonly string[]).includes(value);
}

/** Reduce a record to its shareable, canonical form, or say why it cannot be. */
export function canonicalize(kind: CrowdKind, raw: unknown): CanonicalResult {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
    const source = raw as Record<string, unknown>;
    const payload: Record<string, string | number> = {};
    for (const field of FIELDS[kind]) {
        const value = source[field.name];
        if (field.type === 'text') {
            const text = typeof value === 'string' ? value.trim() : '';
            if (!text) {
                if (field.optional) continue;
                // Required text may be empty: an armour the parser could not
                // classify still has `typ: ""`, and that is what it saw.
                if (typeof value !== 'string') return { ok: false, reason: `${field.name} missing` };
            }
            if (text.length > field.max) return { ok: false, reason: `${field.name} too long` };
            if (!PRINTABLE_ASCII.test(text)) return { ok: false, reason: `${field.name} not ascii` };
            payload[field.name] = text;
        } else {
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > field.max) {
                return { ok: false, reason: `${field.name} out of range` };
            }
            payload[field.name] = value;
        }
    }
    // Names come lower case from the game; an import may not
    const key = payload[KEY_FIELD[kind]];
    if (typeof key !== 'string' || !key) return { ok: false, reason: 'empty key' };
    return { ok: true, record: { kind, key: key.toLowerCase(), payload } };
}

/**
 * SHA-256 over kind and payload without the sample fields, hex. Field order is
 * fixed by FIELDS, so JSON is stable.
 */
export async function hashRecord(record: CrowdRecord): Promise<string> {
    const voted = Object.fromEntries(Object.entries(record.payload).filter(([name]) => !SAMPLE_FIELDS.has(name)));
    const text = `${record.kind}\n${JSON.stringify(voted)}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

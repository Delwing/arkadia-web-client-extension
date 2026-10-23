import { describe, test, expect } from 'vitest';
import {
    __resetZlomStoreForTests,
    ensureZlomLoaded,
    getZlomSnapshot,
    iLineMatcher,
    normalizeArmorType,
    sameItem,
    withoutStrayAlt,
    type ShieldEntry,
    upsertByOpis,
    type ArmorEntry,
} from '@modules/data/zlomStore';
import { getFromIndexedDB, storeInIndexedDB } from '@client/utils/dataCache';

// Verbatim from the game
const KHORNE = 'Od stop do glow zakuty jestes w stalowe plyty krwistoczerwonego pelnego pancerza, na ktorego naramiennikach wygrawerowano symbole twego Pana - Khorna.';

describe('iLineMatcher', () => {
    test('text matches a line containing it, whatever the case and the full stop', () => {
        const matches = iLineMatcher('stalowe plyty KRWISTOCZERWONEGO pelnego pancerza.')!;
        expect(matches(KHORNE)).toBe(true);
        expect(matches('Masz na sobie stalowa dluga kolczuge.')).toBe(false);
        expect(iLineMatcher(KHORNE)!(KHORNE)).toBe(true);
    });

    test('Polish letters in the text meet the game\'s folded line', () => {
        expect(iLineMatcher('płyty krwistoczerwonego pełnego pancerza')!(KHORNE)).toBe(true);
    });

    test('/.../ is a regular expression, with its flags', () => {
        expect(iLineMatcher(String.raw`/^Od stop do glow zakut\S* jestes w .+ Khorna\.$/`)!(KHORNE)).toBe(true);
        expect(iLineMatcher('/khorna/')!(KHORNE)).toBe(false);
        expect(iLineMatcher('/khorna/i')!(KHORNE)).toBe(true);
    });

    test('none for an empty line or a regular expression that does not compile', () => {
        expect(iLineMatcher(undefined)).toBeNull();
        expect(iLineMatcher('  ')).toBeNull();
        expect(iLineMatcher('/plyty (/')).toBeNull();
    });
});

describe('upsertByOpis', () => {
    test('a re-evaluated piece keeps the i line it was given', () => {
        const entry: ArmorEntry = {
            short: 'krwistoczerwony pelny pancerz', typ: 'pelna zbroja', klute: 0, obuch: 0, ciete: 0, magik: 0,
            opis: 'pancerz', waga: 0, obj: 0, cena: 0, oslona: 'glowe, korpus, nogi i ramiona', roomId: null,
        };
        const [next] = upsertByOpis([{ ...entry, iLine: 'krwistoczerwonego pelnego pancerza' }], { ...entry, cena: 100 });
        expect(next).toMatchObject({ cena: 100, iLine: 'krwistoczerwonego pelnego pancerza' });
    });
});

describe('armour weight class', () => {
    const armour = (typ: string): ArmorEntry => ({
        short: 'kolczuga', typ, klute: 0, obuch: 0, ciete: 0, magik: 0,
        opis: 'kolczuga', waga: 0, obj: 0, cena: 0, oslona: 'korpus', roomId: null,
    });

    test('is the class alone, as evaluating names it', () => {
        expect(normalizeArmorType('srednia zbroje')).toBe('srednia');
        expect(normalizeArmorType(' Lekka Zbroja ')).toBe('lekka');
        expect(normalizeArmorType('ciezka')).toBe('ciezka');
        expect(normalizeArmorType('')).toBe('');
    });

    test('is fixed in a list stored before, and the fix is kept', async () => {
        // Let the load the module starts on import finish first, or it lands after the reset
        await ensureZlomLoaded();
        await __resetZlomStoreForTests();
        await storeInIndexedDB(
            { dbName: 'ArkadiaZlom', storeName: 'zlom', key: 'snapshot' },
            { bronie: [], tarcze: [], zbroje: [armour('srednia zbroje'), armour('lekka')] },
        );
        await ensureZlomLoaded();
        expect(getZlomSnapshot().zbroje.map(e => e.typ)).toEqual(['srednia', 'lekka']);
        await new Promise(resolve => setTimeout(resolve, 0));
        const stored = await getFromIndexedDB<{ zbroje: ArmorEntry[] }>({ dbName: 'ArkadiaZlom', storeName: 'zlom', key: 'snapshot' });
        expect(stored!.zbroje[0]!.typ).toBe('srednia');
        await __resetZlomStoreForTests();
    });
});

describe('the name evaluating gives an item', () => {
    const shield = (short: string, shortAlt: string): ShieldEntry => ({
        short, shortAlt, klute: 0, obuch: 0, ciete: 0, magik: 0, opis: short, waga: 0, obj: 0, cena: 0,
        parowanie: 0, oslona: 'jedno z ramion', roomId: null,
    });

    test('is kept when it is the same name in another case', () => {
        expect(sameItem('lsniaca plomienista tarcza', 'lsniaca plomienista tarcze')).toBe(true);
        expect(withoutStrayAlt(shield('lsniaca plomienista tarcza', 'lsniaca plomienista tarcze')).shortAlt)
            .toBe('lsniaca plomienista tarcze');
    });

    test('is dropped when it names another item, as the crowd list had it', () => {
        expect(withoutStrayAlt(shield('owalna duza pawez', 'krwistoczerwony poszarpany plaszcz'))).not.toHaveProperty('shortAlt');
        expect(withoutStrayAlt(shield('wysoka stalowa pawez', 'olbrzymi lupkowy glaz'))).not.toHaveProperty('shortAlt');
    });

    test('drops an own entry with a stray one whole, and the fix is kept', async () => {
        await ensureZlomLoaded();
        await __resetZlomStoreForTests();
        await storeInIndexedDB(
            { dbName: 'ArkadiaZlom', storeName: 'zlom', key: 'snapshot' },
            { bronie: [], zbroje: [], tarcze: [
                shield('lsniaca plomienista tarcza', 'lsniaca plomienista tarcze'),
                // Its description and magic are the cloak's too
                shield('owalna duza pawez', 'krwistoczerwony poszarpany plaszcz'),
            ] },
        );
        await ensureZlomLoaded();
        expect(getZlomSnapshot().tarcze.map(e => e.short)).toEqual(['lsniaca plomienista tarcza']);
        await new Promise(resolve => setTimeout(resolve, 0));
        const stored = await getFromIndexedDB<{ tarcze: ShieldEntry[] }>({ dbName: 'ArkadiaZlom', storeName: 'zlom', key: 'snapshot' });
        expect(stored!.tarcze.map(e => e.short)).toEqual(['lsniaca plomienista tarcza']);
        await __resetZlomStoreForTests();
    });
});

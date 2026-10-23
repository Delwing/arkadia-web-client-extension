import { carriedGaps } from '@client/scripts/crowdHints';
import type { ZlomView } from '@modules/crowd/crowdView';
import type { ArmorEntry, ShieldEntry, WeaponEntry } from '@modules/data/zlomStore';

const weapon: WeaponEntry = {
    short: 'dlugi miecz', typ: 'miecze', rodzaj: 'miecz', klute: 1, obuch: 0, ciete: 1, chwyt: 'w dowolnej rece',
    magik: 0, srebro: 0, opis: 'Miecz.', waga: 0, obj: 0, cena: 0, wywazenie: 0, parowanie: 0, roomId: null,
};
const shield: ShieldEntry = {
    short: 'okragla tarcza', klute: 0, obuch: 0, ciete: 0, magik: 0, opis: 'Tarcza.',
    waga: 0, obj: 0, cena: 0, parowanie: 0, oslona: '', roomId: null,
};
const armour: ArmorEntry = {
    short: 'stalowa dluga kolczuga', typ: 'srednia', klute: 0, obuch: 0, ciete: 0, magik: 0, opis: 'Kolczuga.',
    waga: 0, obj: 0, cena: 0, oslona: 'korpus', roomId: null,
};
const view: ZlomView = { bronie: [weapon], tarcze: [shield], zbroje: [{ ...armour, fromCrowd: true }], ubrania: [], dodatki: [] };

const declined = (mianownik: string, biernik: string) => ({
    [mianownik]: { mianownik, dopelniacz: `${mianownik}-D`, celownik: `${mianownik}-C`, biernik, narzednik: `${mianownik}-N`, miejscownik: `${mianownik}-M` },
});

describe('carriedGaps', () => {
    test('finds carried pieces the list cannot say everything about, by the name i gives', () => {
        const gaps = carriedGaps(['okragla tarcze', 'stalowa dluga kolczuge'], view, {});
        expect(gaps.map(g => [g.short, g.gaps])).toEqual([
            ['okragla tarcza', ['odmiany', 'osłony']],
            ['stalowa dluga kolczuga', ['odmiany']],
        ]);
        // Underlined as i lists it and as its own names
        expect(gaps[0]!.names).toEqual(expect.arrayContaining(['okragla tarcze', 'okragla tarcza']));
    });

    test('says nothing about a complete piece, nor about what is no złom at all', () => {
        const odmiany = declined('dlugi miecz', 'dlugi miecz');
        expect(carriedGaps(['dlugi miecz', 'gornicza lampe', '34 miedziane monety'], view, odmiany)).toEqual([]);
    });

    test('underlines every known case of a name, once declined', () => {
        const odmiany = declined('okragla tarcza', 'okragla tarcze');
        const [hint] = carriedGaps(['okragla tarcze'], view, odmiany);
        expect(hint!.gaps).toEqual(['osłony']);
        expect(hint!.names).toEqual(expect.arrayContaining(['okragla tarcza-d', 'okragla tarcza-n']));
    });
});

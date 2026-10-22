import { buildKnownOdmiany, buildZlomView } from '@modules/crowd/crowdView';
import type { CrowdSnapshot } from '@modules/crowd/crowdSnapshot';
import type { ArmorEntry, ShieldEntry, WeaponEntry, ZlomSnapshot } from '@modules/data/zlomStore';

const myShield: ShieldEntry = {
    short: 'okragla tarcza', klute: 4, obuch: 3, ciete: 5, magik: 0, opis: 'Moja tarcza.',
    waga: 3000, obj: 2000, cena: 120, parowanie: 6, oslona: '', roomId: 7, color: '#ff0000', note: 'moja',
};
const myWeapon: WeaponEntry = {
    short: 'dlugi miecz', typ: 'miecze', rodzaj: 'miecz', klute: 0, obuch: 0, ciete: 0, chwyt: '',
    magik: 0, srebro: 0, opis: 'Miecz.', waga: 2000, obj: 1500, cena: 300, wywazenie: 9, parowanie: 7, roomId: null,
};
const own: ZlomSnapshot = { bronie: [myWeapon], tarcze: [myShield], zbroje: [] };

const crowd: CrowdSnapshot = {
    generatedAt: '2026-10-22T20:17:00.000Z',
    bronie: [{
        short: 'Dlugi miecz', typ: 'inne', rodzaj: 'miecz', klute: 1, obuch: 0, ciete: 1, chwyt: 'w dowolnej rece',
        magik: 0, srebro: 0, opis: 'Ich miecz.', confirmations: 4,
    }],
    tarcze: [{
        short: 'okragla tarcza', magik: 0, opis: 'Ich tarcza.', oslona: 'lewa reke', iLine: 'okragla tarcza', confirmations: 2,
    }],
    zbroje: [{
        short: 'stalowa dluga kolczuga', typ: 'srednia', magik: 0, opis: 'Kolczuga.', oslona: 'korpus, nogi i ramiona',
        iLine: 'stalowa kolczuga', confirmations: 3,
    }],
    odmiany: [{
        mianownik: 'dlugi miecz', dopelniacz: 'dlugiego miecza', celownik: 'dlugiemu mieczowi', biernik: 'dlugi miecz',
        narzednik: 'dlugim mieczem', miejscownik: 'dlugim mieczu', confirmations: 2,
    }],
};

describe('buildZlomView', () => {
    test('is just the player\'s list without a crowd one', () => {
        expect(buildZlomView(own, null)).toBe(own);
    });

    test('fills blanks in the player\'s entries, never what they have', () => {
        const view = buildZlomView(own, crowd);
        const shield = view.tarcze[0]!;
        expect(shield).toMatchObject({ oslona: 'lewa reke', iLine: 'okragla tarcza', crowdFilled: ['oslona', 'iLine'] });
        // Theirs stays theirs
        expect(shield).toMatchObject({ opis: 'Moja tarcza.', cena: 120, parowanie: 6, color: '#ff0000', note: 'moja', roomId: 7 });

        const weapon = view.bronie[0]!;
        expect(weapon.typ).toBe('miecze');
        expect(weapon).toMatchObject({ chwyt: 'w dowolnej rece', klute: 1, ciete: 1 });
        expect(weapon.crowdFilled).toEqual(['chwyt', 'obrazenia']);
    });

    test('adds items the player never evaluated, marked, with nothing invented', () => {
        const kolczuga = buildZlomView(own, crowd).zbroje[0] as ArmorEntry & { fromCrowd?: true; confirmations?: number };
        expect(kolczuga).toMatchObject({ short: 'stalowa dluga kolczuga', fromCrowd: true, confirmations: 3, iLine: 'stalowa kolczuga' });
        expect(kolczuga).toMatchObject({ waga: 0, cena: 0, klute: 0, obuch: 0, ciete: 0, roomId: null });
    });

    test('leaves the player\'s own list untouched', () => {
        const before = JSON.stringify(own);
        buildZlomView(own, crowd);
        expect(JSON.stringify(own)).toBe(before);
    });
});

describe('buildKnownOdmiany', () => {
    test('knows the crowd\'s declensions, and the player\'s own win', () => {
        const mine = { 'dlugi miecz': { mianownik: 'dlugi miecz', dopelniacz: 'MOJ', celownik: '', biernik: '', narzednik: '', miejscownik: '' } };
        expect(buildKnownOdmiany({}, crowd)['dlugi miecz']!.dopelniacz).toBe('dlugiego miecza');
        expect(buildKnownOdmiany(mine, crowd)['dlugi miecz']!.dopelniacz).toBe('MOJ');
    });
});

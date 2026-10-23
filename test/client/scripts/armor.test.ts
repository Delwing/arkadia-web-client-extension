vi.mock('@client/scripts/magicKeyLoader', () => ({ default: vi.fn().mockResolvedValue([]) }));
vi.mock('@client/scripts/magicsLoader', () => ({ default: vi.fn().mockResolvedValue([]) }));

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import initInventory from '@client/scripts/inventory';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initArmor, {
    assignILine,
    assignPiece,
    getWornArmor,
    ignoreTodo,
    unignoreTodo,
    parseSlots,
    parseWear,
    previewILine,
    rankILineCandidates,
    slotsFromWorn,
    undeclinedPieces,
    unplacedPieces,
} from '@client/scripts/armor';
import {
    __resetZlomStoreForTests,
    ensureZlomLoaded,
    getZlomSnapshot,
    updateZlomSnapshot,
    type ArmorEntry,
    type WearableEntry,
} from '@modules/data/zlomStore';

const KOLCZUGA = ['korpus', 'nogi', 'lewe ramie', 'prawe ramie'];

describe('parseWear', () => {
    test('reads what was put on and every slot it covers', () => {
        // Verbatim from the game
        expect(parseWear('Zakladasz stalowa dluga kolczuge na tulow, nogi i ramiona.'))
            .toEqual({ item: 'stalowa dluga kolczuge', slots: KOLCZUGA, where: 'tulow, nogi i ramiona' });
        expect(parseWear('Zakladasz garnczkowy helm z jelenim porozem na glowe.'))
            .toEqual({ item: 'garnczkowy helm z jelenim porozem', slots: ['glowa'], where: 'glowe' });
        expect(parseWear('Zakladasz drewniana okuta tarcze na lewa reke.'))
            .toEqual({ item: 'drewniana okuta tarcze', slots: ['tarcza'], where: 'lewa reke' });
    });

    test('takes one arm, both arms, hands and feet', () => {
        expect(parseSlots('lewe ramie')).toEqual(['lewe ramie']);
        expect(parseSlots('ramiona')).toEqual(['lewe ramie', 'prawe ramie']);
        expect(parseSlots('dlonie')).toEqual(['dlonie']);
        expect(parseSlots('stopy')).toEqual(['stopy']);
    });

    test('is no armour when the place is not a slot', () => {
        expect(parseWear('Zakladasz rece na piersi.')).toBeNull();
        expect(parseSlots('piersi')).toEqual([]);
    });
});

describe('armour tracking', () => {
    let client: Client;
    let dispose: () => void;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = new Client({
            send: () => {},
            output: () => {},
            sendGmcp: () => {},
            flushMessageBuffer: () => {},
            emit: () => {},
            shouldEchoCommand: () => true,
        });
        dispose = initArmor(client);
    });

    afterEach(() => dispose());

    const say = (text: string) => client.onLine(text, 'text');

    test('fills slots as things are put on, one piece over several', () => {
        say('Zakladasz stalowa dluga kolczuge na tulow, nogi i ramiona.');
        say('Zakladasz garnczkowy helm z jelenim porozem na glowe.');
        say('Zakladasz drewniana okuta tarcze na lewa reke.');

        expect(getWornArmor().slots).toEqual({
            korpus: 'stalowa dluga kolczuge',
            nogi: 'stalowa dluga kolczuge',
            'lewe ramie': 'stalowa dluga kolczuge',
            'prawe ramie': 'stalowa dluga kolczuge',
            glowa: 'garnczkowy helm z jelenim porozem',
            tarcza: 'drewniana okuta tarcze',
        });
    });

    test('empties every slot of what is taken off', () => {
        say('Zakladasz stalowa dluga kolczuge na tulow, nogi i ramiona.');
        say('Zakladasz garnczkowy helm z jelenim porozem na glowe.');
        // Verbatim from the game
        say('Zdejmujesz z siebie stalowa dluga kolczuge.');

        expect(getWornArmor().slots).toEqual({ glowa: 'garnczkowy helm z jelenim porozem' });
    });

    test('a piece for one arm takes only that arm over', () => {
        say('Zakladasz stalowa dluga kolczuge na tulow, nogi i ramiona.');
        say('Zakladasz skorzany naramiennik na lewe ramie.');
        expect(getWornArmor().slots['lewe ramie']).toBe('skorzany naramiennik');
        expect(getWornArmor().slots['prawe ramie']).toBe('stalowa dluga kolczuge');
    });

    test('keeps it per character', () => {
        say('Zakladasz garnczkowy helm z jelenim porozem na glowe.');
        characterStorage.setCharacter('Other');
        expect(getWornArmor().slots).toEqual({});
        characterStorage.setCharacter('TestChar');
        expect(getWornArmor().slots).toEqual({ glowa: 'garnczkowy helm z jelenim porozem' });
    });

    test('reads armour stored before korpus and the two arms', () => {
        dispose();
        characterStorage.set('worn_armor', { slots: { tulow: 'kaftan', ramiona: 'kolczuge' }, updatedAt: 1 });
        dispose = initArmor(client);
        expect(getWornArmor().slots).toEqual({ korpus: 'kaftan', 'lewe ramie': 'kolczuge', 'prawe ramie': 'kolczuge' });
    });
});

describe('filling the złom list from what is put on', () => {
    let client: Client;
    let dispose: () => void;

    const armour = (short: string, oslona: string): ArmorEntry => ({
        short, typ: 'kolczuga', klute: 0, obuch: 0, ciete: 0, magik: 0, opis: short, waga: 0, obj: 0, cena: 0, oslona, roomId: null,
    });

    beforeEach(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        await __resetZlomStoreForTests();
        await ensureZlomLoaded();
        await updateZlomSnapshot(s => ({
            ...s,
            zbroje: [armour('stalowa dluga kolczuga', ''), armour('garnczkowy helm z jelenim porozem', 'glowe')],
        }));
        client = new Client({
            send: () => {},
            output: () => {},
            sendGmcp: () => {},
            flushMessageBuffer: () => {},
            emit: () => {},
            shouldEchoCommand: () => true,
        });
        dispose = initArmor(client);
    });

    afterEach(() => dispose());

    test('gives a piece with no cover the slots it was put on, tulow as korpus', () => {
        client.onLine('Zakladasz stalowa dluga kolczuge na tulow, nogi i ramiona.', 'text');
        expect(getZlomSnapshot().zbroje[0].oslona).toBe('korpus, nogi i ramiona');
    });

    test('leaves a cover that is already there', () => {
        client.onLine('Zakladasz garnczkowy helm z jelenim porozem na nogi.', 'text');
        expect(getZlomSnapshot().zbroje[1].oslona).toBe('glowe');
    });
});

describe('slotsFromWorn', () => {
    const known = [
        { short: 'stalowa dluga kolczuga', oslona: 'korpus, nogi i ramiona' },
        // As the złom list keeps it: a shield's cover is the game's own words
        { short: 'drewniana okuta tarcza', oslona: 'jedno z ramion', shield: true },
        { short: 'skorzany kaftan', oslona: '' },
    ];

    test('places what the złom list knows the cover of', () => {
        expect(slotsFromWorn(['stalowa dluga kolczuge', 'drewniana okuta tarcze'], known)).toEqual({
            korpus: 'stalowa dluga kolczuge',
            nogi: 'stalowa dluga kolczuge',
            'lewe ramie': 'stalowa dluga kolczuge',
            'prawe ramie': 'stalowa dluga kolczuge',
            tarcza: 'drewniana okuta tarcze',
        });
    });

    test('places nothing the złom list has no cover for', () => {
        expect(slotsFromWorn(['skorzany kaftan'], known)).toEqual({});
    });
});

describe('unplacedPieces', () => {
    test('leaves out jewellery, insignia and a map case', () => {
        // Verbatim from the game
        expect(unplacedPieces([
            'masywny szczerozloty sygnet z herbem Rodziny Alderazzi', 'misterne smocze pierscienie',
            'mosiezna bransolete w ksztalcie smoka', 'gruba czarna opaske z kolcami',
            'masywny amulet z czarnym opalem (rozkazy)', 'dziesiecioramienny talizman ze srebra',
            'mosiezna duza broszka w ksztalcie liscia debu', 'masywna zlocona spinka', 'maske',
            'pasiasta wytarta chuste', 'zamkniety niepowtarzalny wysluzony mapnik',
            'zlocista ciezka przylbice',
        ], {})).toEqual(['zlocista ciezka przylbice']);
    });

    test('leaves out clothes worn over the armour, in any case', () => {
        expect(unplacedPieces(
            ['zwiewny upiorny calun', 'dluga czarna szate', 'gruby welniany plaszcz', 'skorzany kaftan'],
            {},
        )).toEqual(['skorzany kaftan']);
    });

    test('leaves out what is on a slot', () => {
        expect(unplacedPieces(['stalowa dluga kolczuge', 'skorzany kaftan'], { korpus: 'stalowa dluga kolczuge' }))
            .toEqual(['skorzany kaftan']);
    });
});

describe('a slot learned from putting a piece on', () => {
    let client: Client;
    let disposeArmor: () => void;
    let disposeInventory: () => void;

    beforeEach(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        await __resetZlomStoreForTests();
        await ensureZlomLoaded();
        client = new Client({
            send: () => {},
            output: () => {},
            sendGmcp: () => {},
            flushMessageBuffer: () => {},
            emit: () => {},
            shouldEchoCommand: () => true,
        });
        disposeInventory = initInventory(client);
        disposeArmor = initArmor(client);
    });

    afterEach(() => {
        disposeArmor();
        disposeInventory();
    });

    test('is gone once i names the piece in words the złom list does not know', () => {
        client.onLine('Zakladasz garnczkowy helm z jelenim porozem na glowe.', 'text');
        expect(getWornArmor().slots.glowa).toBe('garnczkowy helm z jelenim porozem');

        // Verbatim from the game
        client.onLine([
            'Na glowie masz garnczkowy helm zdobiony majestatycznym jelenim porozem. Z otaczajacego go zawoju wyrastaja wyciete w pasy labry o purpurowo-bialej barwie, ktore opadaja ci swobodnie na ramiona.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'), 'text');

        expect(getWornArmor().slots).toEqual({});
        expect(getWornArmor().unplaced).toEqual(['garnczkowy helm zdobiony majestatycznym jelenim porozem']);
    });
});

describe('armour from an i reply', () => {
    let client: Client;
    let disposeArmor: () => void;
    let disposeInventory: () => void;

    const armour = (short: string, oslona: string): ArmorEntry => ({
        short, typ: '', klute: 0, obuch: 0, ciete: 0, magik: 0, opis: short, waga: 0, obj: 0, cena: 0, oslona, roomId: null,
    });

    beforeEach(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        await __resetZlomStoreForTests();
        await ensureZlomLoaded();
        await updateZlomSnapshot(snapshot => ({
            ...snapshot,
            zbroje: [armour('stalowa dluga kolczuga', 'korpus, nogi i ramiona')],
            tarcze: [{ ...armour('drewniana okuta tarcza', 'jedno z ramion'), parowanie: 0 }],
        }));
        client = new Client({
            send: () => {},
            output: () => {},
            sendGmcp: () => {},
            flushMessageBuffer: () => {},
            emit: () => {},
            shouldEchoCommand: () => true,
        });
        disposeInventory = initInventory(client);
        disposeArmor = initArmor(client);
    });

    afterEach(() => {
        disposeArmor();
        disposeInventory();
    });

    test('fills the slots of what is worn, never having seen it put on', () => {
        // Verbatim from the game
        client.onLine([
            'Przy lewym boku masz przypiety kunsztowny skorzany temblak.',
            'Na plecach nosisz prawie pusty zamkniety zolty podrozny plecak.',
            'Na glowie masz garnczkowy helm zdobiony majestatycznym jelenim porozem. Z otaczajacego go zawoju wyrastaja wyciete w pasy labry o purpurowo-bialej barwie, ktore opadaja ci swobodnie na ramiona.',
            'Masz na sobie stalowa dluga kolczuge i drewniana okuta tarcze.',
            'Do pasa masz przytroczone gornicza lampe i skorzany buklak.',
            'Masz przy sobie skorzane ciemne nogawice i 34 miedziane monety.',
        ].join('\n'), 'text');

        expect(getWornArmor().slots).toEqual({
            korpus: 'stalowa dluga kolczuge',
            nogi: 'stalowa dluga kolczuge',
            'lewe ramie': 'stalowa dluga kolczuge',
            'prawe ramie': 'stalowa dluga kolczuge',
            tarcza: 'drewniana okuta tarcze',
        });
    });

    test('lists what is worn but on no slot, and the lines nothing knows', () => {
        client.onLine([
            'Na glowie masz garnczkowy helm zdobiony majestatycznym jelenim porozem.',
            'Masz na sobie stalowa dluga kolczuge.',
            'Twoje cialo spowija lsniaca mithrilowa luska.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'), 'text');

        const armor = getWornArmor();
        expect(armor.slots.korpus).toBe('stalowa dluga kolczuge');
        expect(armor.unplaced).toEqual(['garnczkowy helm zdobiony majestatycznym jelenim porozem']);
        expect(armor.unknownLines).toEqual(['Twoje cialo spowija lsniaca mithrilowa luska.']);
    });

    test('a reply the player asked for may start with a line nothing knows', async () => {
        await client.sendCommand('i');
        client.onLine([
            'Twoje cialo spowija lsniaca mithrilowa luska.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'), 'text');
        expect(getWornArmor().unknownLines).toEqual(['Twoje cialo spowija lsniaca mithrilowa luska.']);
    });

    test('a line nothing knows outside a reply is not taken for one', () => {
        client.onLine('Twoje cialo spowija lsniaca mithrilowa luska.', 'text');
        client.onLine('Masz przy sobie 34 miedziane monety.', 'text');
        expect(getWornArmor().unknownLines).toEqual([]);
    });

    test('putting a listed piece on takes it off the list', () => {
        client.onLine([
            'Na glowie masz garnczkowy helm z jelenim porozem.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'), 'text');
        expect(getWornArmor().unplaced).toEqual(['garnczkowy helm z jelenim porozem']);
        client.onLine('Zakladasz garnczkowy helm z jelenim porozem na glowe.', 'text');
        expect(getWornArmor().unplaced).toEqual([]);
        expect(getWornArmor().slots.glowa).toBe('garnczkowy helm z jelenim porozem');
    });

    test('a shield on the back is carried, not held on an arm', () => {
        client.onLine([
            'Na plecy masz zarzucona drewniana okuta tarcze.',
            'Masz przy sobie lampe.',
        ].join('\n'), 'text');
        expect(getWornArmor().slots).toEqual({});
    });
});

describe('armour the i reply words in its own way', () => {
    let client: Client;
    let disposeArmor: () => void;
    let disposeInventory: () => void;

    const armour = (short: string, oslona: string, iLine: string): ArmorEntry => ({
        short, typ: '', klute: 0, obuch: 0, ciete: 0, magik: 0, opis: short, waga: 0, obj: 0, cena: 0, oslona, roomId: null, iLine,
    });

    beforeEach(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        await __resetZlomStoreForTests();
        await ensureZlomLoaded();
        await updateZlomSnapshot(snapshot => ({
            ...snapshot,
            zbroje: [
                armour('krwistoczerwony pelny pancerz', 'glowe, korpus, nogi i ramiona', 'krwistoczerwonego pelnego pancerza'),
                armour('czarne rekawice', 'dlonie', String.raw`/^Mrok oplata twe dlonie\b/`),
            ],
            tarcze: [{ ...armour('lsniaca plomienista tarcza', 'jedno z ramion', ''), parowanie: 0 }],
        }));
        client = new Client({
            send: () => {},
            output: () => {},
            sendGmcp: () => {},
            flushMessageBuffer: () => {},
            emit: () => {},
            shouldEchoCommand: () => true,
        });
        disposeInventory = initInventory(client);
        disposeArmor = initArmor(client);
    });

    afterEach(() => {
        disposeArmor();
        disposeInventory();
    });

    test('a piece known by its line takes the slots it covers', () => {
        client.onLine([
            'Trzymasz w rekach dlugi krwisty miecz.',
            // Verbatim from the game
            'Od stop do glow zakuty jestes w stalowe plyty krwistoczerwonego pelnego pancerza, na ktorego naramiennikach wygrawerowano symbole twego Pana - Khorna. Ponadto masz na sobie lsniaca plomienista tarcze.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'), 'text');

        expect(getWornArmor().slots).toEqual({
            glowa: 'krwistoczerwony pelny pancerz',
            korpus: 'krwistoczerwony pelny pancerz',
            nogi: 'krwistoczerwony pelny pancerz',
            'lewe ramie': 'krwistoczerwony pelny pancerz',
            'prawe ramie': 'krwistoczerwony pelny pancerz',
            tarcza: 'lsniaca plomienista tarcze',
        });
    });

    test('a line no part of the reply knows counts while the reply is read, and only then', () => {
        client.onLine('Mrok oplata twe dlonie niczym rekawice.', 'text');
        expect(getWornArmor().slots).toEqual({});

        client.onLine([
            'Trzymasz w rekach dlugi krwisty miecz.',
            'Mrok oplata twe dlonie niczym rekawice.',
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'), 'text');
        expect(getWornArmor().slots).toEqual({ dlonie: 'czarne rekawice' });
    });
});

describe('giving an unrecognised i line to a piece', () => {
    let client: Client;
    let disposeArmor: () => void;
    let disposeInventory: () => void;

    const LINE = 'Twoje cialo spowija lsniaca mithrilowa luska.';
    const armour = (short: string, oslona: string, iLine?: string): ArmorEntry => ({
        short, typ: '', klute: 0, obuch: 0, ciete: 0, magik: 0, opis: `${short} - opis`, waga: 0, obj: 0, cena: 0, oslona, roomId: null,
        ...(iLine ? { iLine } : {}),
    });

    beforeEach(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        await __resetZlomStoreForTests();
        await ensureZlomLoaded();
        await updateZlomSnapshot(snapshot => ({
            ...snapshot,
            zbroje: [
                armour('stalowa dluga kolczuga', 'korpus, nogi i ramiona'),
                armour('lsniaca mithrilowa luska', 'korpus i ramiona'),
                armour('mithrilowe nagolenniki', ''),
            ],
            tarcze: [],
        }));
        client = new Client({
            send: () => {},
            output: () => {},
            sendGmcp: () => {},
            flushMessageBuffer: () => {},
            emit: () => {},
            shouldEchoCommand: () => true,
        });
        disposeInventory = initInventory(client);
        disposeArmor = initArmor(client);
        client.onLine([
            'Masz na sobie stalowa dluga kolczuge.',
            LINE,
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'), 'text');
    });

    afterEach(() => {
        disposeArmor();
        disposeInventory();
    });

    test('puts the piece the line names first', () => {
        const ranked = rankILineCandidates(LINE, getZlomSnapshot());
        expect(ranked[0]!.entry.short).toBe('lsniaca mithrilowa luska');
        expect(ranked[1]!.entry.short).toBe('mithrilowe nagolenniki');
    });

    test('previews what the fragment matches and where the piece goes', () => {
        const luska = getZlomSnapshot().zbroje[1]!;
        expect(previewILine('mithrilowa luska', [LINE], getZlomSnapshot(), 'zbroje', luska))
            .toEqual({ valid: true, matched: [LINE], clashes: [], slots: ['korpus', 'lewe ramie', 'prawe ramie'] });
        expect(previewILine('/(/', [LINE], getZlomSnapshot(), 'zbroje', luska).valid).toBe(false);
        // No cover known yet: it would match, but take no slot
        const nagolenniki = getZlomSnapshot().zbroje[2]!;
        expect(previewILine('mithrilowa', [LINE], getZlomSnapshot(), 'zbroje', nagolenniki).slots).toEqual([]);
    });

    test('warns when another piece already claims the line', async () => {
        await updateZlomSnapshot(snapshot => ({
            ...snapshot,
            zbroje: snapshot.zbroje.map(e => e.short === 'mithrilowe nagolenniki' ? { ...e, iLine: 'mithrilowa' } : e),
        }));
        const luska = getZlomSnapshot().zbroje[1]!;
        expect(previewILine('luska', [LINE], getZlomSnapshot(), 'zbroje', luska).clashes).toEqual(['mithrilowe nagolenniki']);
    });

    test('saves the fragment and places the piece without another i', async () => {
        expect(getWornArmor().unknownLines).toEqual([LINE]);
        await assignILine('zbroje', 'lsniaca mithrilowa luska - opis', 'mithrilowa luska');

        expect(getZlomSnapshot().zbroje[1]!.iLine).toBe('mithrilowa luska');
        const armor = getWornArmor();
        expect(armor.unknownLines).toEqual([]);
        expect(armor.slots.korpus).toBe('lsniaca mithrilowa luska');
        expect(armor.slots['lewe ramie']).toBe('lsniaca mithrilowa luska');
        // What the reply placed by name stays
        expect(armor.slots.nogi).toBe('stalowa dluga kolczuge');
    });

    test('the next i places it by its line', async () => {
        await assignILine('zbroje', 'lsniaca mithrilowa luska - opis', 'mithrilowa luska');
        client.onLine([
            'Masz na sobie stalowa dluga kolczuge.',
            LINE,
            'Masz przy sobie 34 miedziane monety.',
        ].join('\n'), 'text');
        expect(getWornArmor().unknownLines).toEqual([]);
        expect(getWornArmor().slots.korpus).toBe('lsniaca mithrilowa luska');
    });
});

describe('tying a piece i lists by name to its złom entry', () => {
    let client: Client;
    let disposeArmor: (() => void) | undefined;
    let disposeInventory: (() => void) | undefined;

    const HELM = 'garnczkowy helm zdobiony majestatycznym jelenim porozem';
    const helm = (oslona: string): ArmorEntry => ({
        short: 'garnczkowy helm z jelenim porozem', typ: '', klute: 0, obuch: 0, ciete: 0, magik: 0,
        opis: 'Helm z porozem.', waga: 0, obj: 0, cena: 0, oslona, roomId: null,
    });
    const reply = () => client.onLine([
        `Na glowie masz ${HELM}.`,
        'Masz przy sobie 34 miedziane monety.',
    ].join('\n'), 'text');

    async function setup(oslona: string) {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        await __resetZlomStoreForTests();
        await ensureZlomLoaded();
        await updateZlomSnapshot(snapshot => ({ ...snapshot, zbroje: [helm(oslona)], tarcze: [] }));
        client = new Client({
            send: () => {},
            output: () => {},
            sendGmcp: () => {},
            flushMessageBuffer: () => {},
            emit: () => {},
            shouldEchoCommand: () => true,
        });
        disposeInventory = initInventory(client);
        disposeArmor = initArmor(client);
        reply();
    }

    afterEach(() => {
        disposeArmor?.();
        disposeInventory?.();
        disposeArmor = disposeInventory = undefined;
    });

    test('a piece named differently takes its slot, and the next i knows it', async () => {
        await setup('glowe');
        expect(getWornArmor().unplaced).toEqual([HELM]);

        await assignPiece(HELM, 'zbroje', 'Helm z porozem.');
        expect(getZlomSnapshot().zbroje[0]!.iLine).toBe(HELM);
        expect(getWornArmor().slots.glowa).toBe(HELM);
        expect(getWornArmor().unplaced).toEqual([]);

        reply();
        expect(getWornArmor().slots.glowa).toBe('garnczkowy helm z jelenim porozem');
        expect(getWornArmor().unplaced).toEqual([]);
    });

    test('a piece whose cover ocen has not told stays to be filled in', async () => {
        await setup('');
        await assignPiece(HELM, 'zbroje', 'Helm z porozem.');
        expect(getZlomSnapshot().zbroje[0]!.oslona).toBe('');
        expect(getWornArmor().slots).toEqual({});
        reply();
        expect(getWornArmor().unplaced).toEqual([HELM]);
    });
});

describe('clothes and add-ons from an i reply', () => {
    let client: Client;
    let disposeArmor: () => void;
    let disposeInventory: () => void;

    const wearable = (short: string, material: string, extra: Partial<WearableEntry> = {}): WearableEntry => ({
        short, material, opis: short, waga: 0, obj: 0, cena: 0, roomId: null, ...extra,
    });

    beforeEach(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        await __resetZlomStoreForTests();
        await ensureZlomLoaded();
        await updateZlomSnapshot(snapshot => ({
            ...snapshot,
            ubrania: [wearable('krwistoczerwony poszarpany plaszcz', 'welny')],
            dodatki: [wearable('mosiezna obroza z runa Khorna', 'mosiadzu')],
        }));
        client = new Client({
            send: () => {},
            output: () => {},
            sendGmcp: () => {},
            flushMessageBuffer: () => {},
            emit: () => {},
            shouldEchoCommand: () => true,
        });
        disposeInventory = initInventory(client);
        disposeArmor = initArmor(client);
    });

    afterEach(() => {
        disposeArmor();
        disposeInventory();
    });

    test('shows what the złom list knows as clothes or an add-on, on no slot', () => {
        // Verbatim from the game
        client.onLine([
            'Trzymasz opalizujacy runiczny topor obosieczny w prawej rece.',
            'Wokol szyi masz zacisnieta mosieznej obrozy z runa Khorna, ktorej ostre cwieki upuscily ci nieco krwi.',
            'Nosisz krwistoczerwony poszarpany plaszcz z naciagnietym na glowe kapturem.',
            'Masz przy sobie tlusciutkie nikczemne licho i maly cynowy kubek.',
        ].join('\n'), 'text');

        const worn = getWornArmor();
        // Under their złom names, whatever case `i` lists them in
        expect(worn.extras).toEqual([
            { name: 'mosiezna obroza z runa Khorna', worn: 'mosieznej obrozy z runa Khorna', kind: 'dodatki', material: 'mosiadzu' },
            { name: 'krwistoczerwony poszarpany plaszcz', worn: 'krwistoczerwony poszarpany plaszcz', kind: 'ubrania', material: 'welny' },
        ]);
        expect(worn.slots).toEqual({});
        expect(worn.unplaced).toEqual([]);
        expect(worn.unknownLines).toEqual([]);
    });

    test('shows jewellery the list does not know yet, without a kind', () => {
        // Verbatim from the game
        client.onLine([
            'Nasuniety na serdeczny palec twej prawej dloni masywny szczerozloty sygnet z herbem Rodziny Alderazzi jest oznaka nadanej ci pozycji Caporegime.',
            'Na lewym nadgarstku nosisz mosiezna bransolete w ksztalcie smoka.',
            'Na palce masz nasuniete trzy misterne smocze pierscienie.',
            'Masz przy sobie bulke.',
        ].join('\n'), 'text');

        expect(getWornArmor().extras.map(({ name, kind }) => [name, kind])).toEqual([
            ['masywny szczerozloty sygnet z herbem Rodziny Alderazzi', null],
            ['mosiezna bransolete w ksztalcie smoka', null],
            ['misterne smocze pierscienie', null],
        ]);
        expect(getWornArmor().unplaced).toEqual([]);
    });

    test('an add-on worded in a line of its own is shown once given that line', async () => {
        const reply = () => client.onLine([
            'Trzymasz w rekach dlugi krwisty miecz.',
            'Twe ramiona oplata mglisty welon.',
            'Masz przy sobie bulke.',
        ].join('\n'), 'text');
        reply();
        expect(getWornArmor().unknownLines).toEqual(['Twe ramiona oplata mglisty welon.']);

        await assignILine('dodatki', 'mosiezna obroza z runa Khorna', 'mglisty welon');
        expect(getWornArmor().unknownLines).toEqual([]);
        expect(getWornArmor().extras).toEqual([{ name: 'mosiezna obroza z runa Khorna', kind: 'dodatki', material: 'mosiadzu' }]);

        // And the next reply knows it by itself
        reply();
        expect(getWornArmor().extras.map(e => e.name)).toEqual(['mosiezna obroza z runa Khorna']);
        expect(getWornArmor().unknownLines).toEqual([]);
    });

    test('an ignored piece or line (a guild item, say) stays off the list until brought back', () => {
        const reply = () => client.onLine([
            'Trzymasz w rekach dlugi krwisty miecz.',
            'Masz na sobie stalowa kolczuge klubowa.',
            'Na twej piersi lsni znak gildii kupcow.',
            'Masz przy sobie bulke.',
        ].join('\n'), 'text');
        reply();
        expect(getWornArmor().unplaced).toEqual(['stalowa kolczuge klubowa']);
        expect(getWornArmor().unknownLines).toEqual(['Na twej piersi lsni znak gildii kupcow.']);

        ignoreTodo('stalowa kolczuge klubowa');
        ignoreTodo('Na twej piersi lsni znak gildii kupcow.');
        expect(getWornArmor()).toMatchObject({ unplaced: [], unknownLines: [] });

        reply();
        expect(getWornArmor()).toMatchObject({
            unplaced: [],
            unknownLines: [],
            ignored: ['stalowa kolczuge klubowa', 'Na twej piersi lsni znak gildii kupcow.'],
        });

        unignoreTodo('stalowa kolczuge klubowa');
        reply();
        expect(getWornArmor().unplaced).toEqual(['stalowa kolczuge klubowa']);
        expect(getWornArmor().ignored).toEqual(['Na twej piersi lsni znak gildii kupcow.']);
    });
});

describe('undeclinedPieces', () => {
    const piece = (short: string, extra: Partial<ArmorEntry> = {}): ArmorEntry => ({
        short, typ: '', klute: 0, obuch: 0, ciete: 0, magik: 0, opis: short, waga: 0, obj: 0, cena: 0,
        oslona: 'glowe', roomId: null, ...extra,
    });
    const snapshot = {
        bronie: [],
        tarcze: [{ ...piece('drewniana okuta tarcza'), parowanie: 0 }],
        zbroje: [
            piece('stalowa dluga kolczuga'),
            piece('garnczkowy helm z jelenim porozem', { iLine: 'garnczkowy helm zdobiony' }),
        ],
    };
    const plecak = {
        mianownik: 'stalowa dluga kolczuga', dopelniacz: 'x', celownik: 'x', biernik: 'x', narzednik: 'x', miejscownik: 'x',
    };

    test('names worn pieces by their złom nominative, once each, unless already declined', () => {
        const slots = {
            korpus: 'stalowa dluga kolczuge',
            nogi: 'stalowa dluga kolczuge',
            glowa: 'garnczkowy helm zdobiony majestatycznym jelenim porozem',
            tarcza: 'drewniana okuta tarcze',
            stopy: 'nieznane buty',
        };
        expect(undeclinedPieces(slots, snapshot, {})).toEqual([
            'stalowa dluga kolczuga',
            'garnczkowy helm z jelenim porozem',
            'drewniana okuta tarcza',
        ]);
        expect(undeclinedPieces(slots, snapshot, { 'stalowa dluga kolczuga': plecak })).not.toContain('stalowa dluga kolczuga');
    });
});

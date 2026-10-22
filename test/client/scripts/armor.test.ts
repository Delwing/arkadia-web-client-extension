vi.mock('@client/scripts/magicKeyLoader', () => ({ default: vi.fn().mockResolvedValue([]) }));
vi.mock('@client/scripts/magicsLoader', () => ({ default: vi.fn().mockResolvedValue([]) }));

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import initInventory from '@client/scripts/inventory';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initArmor, { getWornArmor, parseSlots, parseWear, slotsFromWorn } from '@client/scripts/armor';
import {
    __resetZlomStoreForTests,
    ensureZlomLoaded,
    getZlomSnapshot,
    updateZlomSnapshot,
    type ArmorEntry,
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
        expect(slotsFromWorn(['stalowa dluga kolczuge', 'drewniana okuta tarcze'], {}, known)).toEqual({
            korpus: 'stalowa dluga kolczuge',
            nogi: 'stalowa dluga kolczuge',
            'lewe ramie': 'stalowa dluga kolczuge',
            'prawe ramie': 'stalowa dluga kolczuge',
            tarcza: 'drewniana okuta tarcze',
        });
    });

    test('keeps a slot put on by hand while the same kind of thing is still worn', () => {
        const previous = { glowa: 'garnczkowy helm z jelenim porozem' };
        // The reply describes the helmet more fully than putting it on did
        expect(slotsFromWorn(['garnczkowy helm zdobiony majestatycznym jelenim porozem'], previous, known))
            .toEqual(previous);
    });

    test('drops what is no longer worn, and what has no known cover', () => {
        const previous = { glowa: 'garnczkowy helm z jelenim porozem', korpus: 'skorzany kaftan' };
        expect(slotsFromWorn(['skorzany kaftan'], previous, known)).toEqual({ korpus: 'skorzany kaftan' });
        expect(slotsFromWorn([], previous, known)).toEqual({});
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

    test('a shield on the back is carried, not held on an arm', () => {
        client.onLine([
            'Na plecy masz zarzucona drewniana okuta tarcze.',
            'Masz przy sobie lampe.',
        ].join('\n'), 'text');
        expect(getWornArmor().slots).toEqual({});
    });
});

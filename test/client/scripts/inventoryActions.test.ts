vi.mock('@client/scripts/magicKeyLoader', () => ({ default: vi.fn().mockResolvedValue([]) }));
vi.mock('@client/scripts/magicsLoader', () => ({ default: vi.fn().mockResolvedValue([]) }));
vi.mock('@modules/data/dataStores/magicsStore', () => ({
    getMagicsStore: vi.fn(() => ({
        getSnapshot: vi.fn().mockResolvedValue({ data: { magics: {} } }),
        subscribe: vi.fn(() => () => {}),
    })),
    MagicsFile: {},
}));

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import eventBus from '@modules/core/eventBus';
import { characterStorage } from '@modules/core/storage';
import initContainers from '@client/scripts/prettyContainers';
import initBagManager, { containerAction } from '@client/scripts/bagManager';
import initInventory, { getInventoryState } from '@client/scripts/inventory';
import initInventoryActions, { itemTarget, splitName } from '@client/scripts/inventoryActions';

const CARRIED =
    'Masz przy sobie dwa zamkniete szarawe skorzane woreczki, zamkniety skorzany woreczek z herbem, ' +
    'otwarty prosty skorzany plecak, 23 zlote monety, maly cynowy kubek i kosciany widelec.';

describe('splitName', () => {
    test('finds the noun between adjectives and detail', () => {
        expect(splitName('skorzany woreczek z herbem')).toEqual({ before: 'skorzany', noun: 'woreczek', after: 'z herbem' });
    });
});

describe('itemTarget', () => {
    test('names an item by its last adjective and noun', () => {
        const kubek = { name: 'maly cynowy kubek', count: 1 };
        expect(itemTarget(kubek, [kubek])).toBe('cynowy kubek');
    });

    test('numbers it among items that answer to the same words', () => {
        const a = { name: 'zamkniety szarawy skorzany woreczek', count: 1 };
        const b = { name: 'zamkniety szarawy skorzany woreczek', count: 1 };
        const herb = { name: 'zamkniety skorzany woreczek z herbem', count: 1 };
        expect(itemTarget(herb, [a, b, herb])).toBe('3. skorzany woreczek');
    });

    test('takes "wiele" coins by their plain name, not the genitive they are listed in', () => {
        // Listed as "wiele zlotych monet"
        expect(itemTarget({ name: 'zlotych monet', count: 'wie' }, [])).toBe('zlote monety');
        expect(itemTarget({ name: 'srebrnych monet', count: 'wie' }, [])).toBe('srebrne monety');
        expect(itemTarget({ name: 'mithrylowych monet', count: 'wie' }, [])).toBe('mithrylowe monety');
        // A number keeps the listed form, which already fits it
        expect(itemTarget({ name: 'zlotych monet', count: 5 }, [])).toBe('5 zlotych monet');
        expect(itemTarget({ name: 'miedziana monete', count: 1 }, [])).toBe('miedziana monete');
    });

    test('leaves state words out and gives a count for several', () => {
        expect(itemTarget({ name: 'zamkniety woreczek', count: 1 }, [])).toBe('woreczek');
        expect(itemTarget({ name: 'zlote monety', count: 23 }, [])).toBe('23 zlote monety');
    });
});

describe('inventory window actions', () => {
    let client: Client;
    let sent: string[];
    let disposeInventory: () => void;
    let disposeActions: () => void;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        sent = [];
        client = new Client({
            send: (command: string) => { sent.push(command); },
            output: () => {},
            sendGmcp: () => {},
            flushMessageBuffer: () => {},
            emit: () => {},
            shouldEchoCommand: () => true,
        });
        initContainers(client);
        initBagManager(client);
        disposeInventory = initInventory(client);
        disposeActions = initInventoryActions(client);
        client.onLine(CARRIED, 'text');
    });

    afterEach(() => {
        disposeActions();
        disposeInventory();
    });

    const entry = (label: string) => getInventoryState().sections.flatMap(s => s.entries).filter(e => e.label === label);
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));

    test('drops an item', async () => {
        eventBus.emit('inventory.action', { kind: 'drop', key: entry('maly cynowy kubek')[0].key });
        await flush();
        expect(sent).toEqual(['odloz cynowy kubek']);
    });

    test('evaluates an item as odloz names it, and a bag by its own form', async () => {
        eventBus.emit('inventory.action', { kind: 'evaluate', key: entry('maly cynowy kubek')[0].key });
        eventBus.emit('inventory.action', { kind: 'evaluate', key: entry('skorzany woreczek z herbem')[0].key });
        await flush();
        expect(sent).toEqual(['ocen cynowy kubek', 'ocen 3. swoj woreczek']);
    });

    test('opens and closes a bag by its number', async () => {
        const [, second] = entry('szarawy skorzany woreczek');
        eventBus.emit('inventory.action', { kind: 'open', key: second.key });
        await flush();
        expect(sent).toEqual(['otworz 2. swoj woreczek']);

        client.onLine('Otwierasz zamkniety szarawy skorzany woreczek.', 'text');
        expect(entry('szarawy skorzany woreczek').map(e => e.state)).toContain('open');
    });

    test('opening a door changes nothing', async () => {
        await client.sendCommand('otworz drzwi');
        client.onLine('Otwierasz drzwi.', 'text');
        expect(getInventoryState().stale).toBe(false);
    });

    test('puts into a bag from /pojemnik through the bag manager, as /wdp does', async () => {
        const plecak = entry('prosty skorzany plecak')[0];
        eventBus.emit('inventory.action', { kind: 'put', key: entry('maly cynowy kubek')[0].key, bag: plecak.key });
        await flush();
        // The plecak holds every type by default; the bag manager opens and closes it as set
        expect(sent).toEqual(['otworz swoj plecak', 'wloz cynowy kubek do swojego plecaka', 'zamknij swoj plecak']);
    });

    test('opens a closed bag around a transfer and closes it after', async () => {
        const herb = entry('skorzany woreczek z herbem')[0];
        eventBus.emit('inventory.action', { kind: 'put', key: entry('maly cynowy kubek')[0].key, bag: herb.key });
        await flush();
        expect(sent).toEqual([
            'otworz 3. swoj woreczek',
            'wloz cynowy kubek do 3. swojego woreczka',
            'zamknij 3. swoj woreczek',
        ]);
    });

    test('a transfer the window made moves the item into the bag it saw', async () => {
        const plecak = entry('prosty skorzany plecak')[0];
        client.onLine('Otwarty prosty skorzany plecak zawiera lampe.', 'text');

        eventBus.emit('inventory.action', { kind: 'put', key: entry('maly cynowy kubek')[0].key, bag: plecak.key });
        await flush();
        client.onLine('Wkladasz maly cynowy kubek do prostego skorzanego plecaka.', 'text');

        const after = entry('prosty skorzany plecak')[0];
        expect(after.container?.contents).toMatchObject({
            stale: false,
            items: [{ name: 'lampe', count: 1 }, { name: 'maly cynowy kubek', count: 1 }],
        });
        expect(entry('maly cynowy kubek')).toEqual([]);
    });

    test('takes out of a bag and back onto the list', async () => {
        const plecak = entry('prosty skorzany plecak')[0];
        client.onLine('Otwarty prosty skorzany plecak zawiera lampe i dwa noze.', 'text');

        eventBus.emit('inventory.action', { kind: 'take', bag: plecak.key, item: 1 });
        await flush();
        expect(sent).toEqual(['otworz swoj plecak', 'wez 2 noze ze swojego plecaka', 'zamknij swoj plecak']);

        client.onLine('Bierzesz dwa noze z prostego skorzanego plecaka.', 'text');
        expect(entry('prosty skorzany plecak')[0].container?.contents?.items).toEqual([{ name: 'lampe', count: 1 }]);
        expect(entry('noze')[0]).toMatchObject({ count: 2 });
    });

    test('moves between bags through the hands', async () => {
        const plecak = entry('prosty skorzany plecak')[0];
        const [first] = entry('szarawy skorzany woreczek');
        client.onLine('Otwarty prosty skorzany plecak zawiera lampe.', 'text');

        eventBus.emit('inventory.action', { kind: 'move', from: plecak.key, item: 0, bag: first.key });
        await flush();
        expect(sent).toEqual([
            'otworz swoj plecak',
            'wez lampe ze swojego plecaka',
            'zamknij swoj plecak',
            // Not a /pojemnik bag: opened and closed around it, as it is closed
            'otworz 1. swoj woreczek',
            'wloz lampe do 1. swojego woreczka',
            'zamknij 1. swoj woreczek',
        ]);
    });

    test('marks bags set in /pojemnik', () => {
        characterStorage.set('containers', { money: '2. woreczek', gems: 'plecak', food: 'plecak', other: 'plecak' });
        const [, second] = entry('szarawy skorzany woreczek');
        expect(second.assigned?.map(t => t.id)).toEqual(['money']);
        expect(entry('prosty skorzany plecak')[0].assigned?.map(t => t.id)).toEqual(['gems', 'food', 'other']);
    });

    test('a refused put moves nothing and says why', async () => {
        const refusals: string[] = [];
        const off = eventBus.on('inventory.failed', ({ text }) => { refusals.push(text); });
        const plecak = entry('prosty skorzany plecak')[0];
        eventBus.emit('inventory.action', { kind: 'put', key: entry('maly cynowy kubek')[0].key, bag: plecak.key });
        await flush();
        client.onLine('Maly cynowy kubek nie chce wejsc.', 'text');
        off();

        expect(refusals).toEqual(['Maly cynowy kubek nie chce wejsc.']);
        expect(entry('maly cynowy kubek')).toHaveLength(1);
        expect(getInventoryState().stale).toBe(false);
    });

    test('a worn bag is "zalozony", a carried one "swoj", each numbered only among its own kind', async () => {
        client.onLine([
            'Na plecach nosisz prawie pusty otwarty skorzany plecak.',
            'Do pasa masz przytroczone dwie zamkniete skorzane sakiewki.',
            'Masz przy sobie zamkniety prosty plecak i zamknieta runiczna sakiewke.',
        ].join('\n'), 'text');
        const all = getInventoryState().sections.flatMap(s => s.entries);
        const open = async (label: string, index = 0) => {
            eventBus.emit('inventory.action', { kind: 'open', key: all.filter(e => e.label === label)[index].key });
            await flush();
        };
        sent.length = 0;

        await open('prawie pusty skorzany plecak');
        await open('skorzana sakiewke', 1);
        // Not numbered past the worn ones: where they fall in the game's count is not known
        await open('prosty plecak');
        await open('runiczna sakiewke');

        expect(sent).toEqual([
            'otworz zalozony plecak',
            'otworz 2. zalozona sakiewke',
            'otworz swoj plecak',
            'otworz swoja sakiewke',
        ]);
    });

    describe('bags worn and carried alike', () => {
        const WORN_AND_CARRIED = [
            'Na plecach nosisz prawie pusty otwarty skorzany plecak.',
            'Masz przy sobie zamkniety prosty plecak.',
        ].join('\n');
        const say = (text: string) => client.onLine(text, 'text').map(b => b.text).join('');
        const bag = (label: string) => getInventoryState().sections.flatMap(s => s.entries).find(e => e.label === label)!;

        beforeEach(() => {
            client.onLine(WORN_AND_CARRIED, 'text');
            sent.length = 0;
        });

        test('says it cannot tell their numbers, and sends nothing on its own', () => {
            expect(getInventoryState().unsure).toEqual([{ noun: 'plecak', label: 'plecak' }]);
            expect(sent).toEqual([]);
        });

        test('asks the game with ocen when told to, hides the replies and uses what it learned', async () => {
            const print = vi.spyOn(client, 'print');
            eventBus.emit('inventory.verify', { noun: 'plecak' });
            expect(sent).toEqual(['ocen 1. plecak', 'ocen 2. plecak']);

            // Verbatim shapes from the game; the last line of the second one wrapped
            const out = [
                'Oceniasz starannie zamkniety prosty plecak.',
                'Dosc wygodny plecak zaopatrzony w szelki i klape.',
                'Jest zamkniety.',
                'Ten element ekwipunku wyglada na calkiem nowy. [5/5]',
                'Oceniasz starannie otwarty skorzany plecak.',
                'Wygodny i pojemny plecak, zrobiony z brazowej, byczej skory.',
                'Ten element ekwipunku wyglada na w duzym stopniu',
                'zniszczony. [2/5]',
            ].map(say).join('');
            expect(out).toBe('');
            expect(getInventoryState().unsure).toEqual([]);
            // Said in the game window too, for a check started from /pojemnik
            expect(print).toHaveBeenCalledWith('Numeracja (plecak): 1. prosty plecak, 2. prawie pusty skorzany plecak (zalozony)');
            expect(getInventoryState().verifying).toBe(false);

            sent.length = 0;
            eventBus.emit('inventory.action', { kind: 'open', key: bag('prosty plecak').key });
            eventBus.emit('inventory.action', { kind: 'open', key: bag('prawie pusty skorzany plecak').key });
            await flush();
            // The game counts the carried one first here
            expect(sent).toEqual(['otworz 1. swoj plecak', 'otworz zalozony plecak']);

            // So does /wdp, through the bag manager
            sent.length = 0;
            characterStorage.set('containers', { money: 'plecak', gems: 'plecak', food: 'plecak', other: 'plecak' });
            containerAction(client, 'money', 'take', 'monety');
            await flush();
            expect(sent).toEqual(['otworz 1. swoj plecak', 'wez monety z 1. swojego plecaka', 'zamknij 1. swoj plecak']);
        });

        test('asks again once the bags of the kind change', () => {
            eventBus.emit('inventory.verify', { noun: 'plecak' });
            ['Oceniasz starannie otwarty skorzany plecak.', 'Ten element ekwipunku wyglada na nowy. [5/5]',
                'Oceniasz starannie zamkniety prosty plecak.', 'Ten element ekwipunku wyglada na nowy. [5/5]'].forEach(say);
            expect(getInventoryState().unsure).toEqual([]);

            client.onLine([
                'Na plecach nosisz prawie pusty otwarty skorzany plecak.',
                'Masz przy sobie zamkniety prosty plecak i zielony plecak.',
            ].join('\n'), 'text');
            expect(getInventoryState().unsure).toEqual([{ noun: 'plecak', label: 'plecak' }]);
        });
    });
});

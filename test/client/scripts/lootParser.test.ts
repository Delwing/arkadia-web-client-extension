import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';
import initLootParser, {
    getRoomContents,
    getBodyExtras,
    getBodyStertyMap,
    clearBodyExtras,
    setLootPopupMode,
} from '@client/scripts/lootParser';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

const BODY = 'Jest to martwe cialo wielkiego szczura.';
const REMAINS = 'Sa to smetne pozostalosci po jakims goblinie.';
const ITEMS = 'Zauwazasz przy nim zloty pierscien i skorzany bukłak.'.replace('bukłak', 'buklak');

describe('lootParser', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initLootParser(client);
        // Module-level state is a singleton — reset it.
        clearBodyExtras();
        setLootPopupMode(false);
        client.sendEvent('enterLocation', {} as any);
    });

    afterEach(() => {
        clearBodyExtras();
        setLootPopupMode(false);
    });

    describe('body loot', () => {
        test('the loot line is made clickable', () => {
            client.onLine(BODY, 'text');

            const [out] = client.onLine(ITEMS, 'text');

            expect(out.text).toBe(ITEMS);
            expect(out.toHtml()).toContain('data-output-clickable');
            expect(out.toHtml()).toContain('wez zloty pierscien z ciala');
        });

        test('remains are recognised as well', () => {
            client.onLine(REMAINS, 'text');

            const [out] = client.onLine(ITEMS, 'text');

            expect(out.toHtml()).toContain('data-output-clickable');
        });

        test('items on remains are taken from the numbered sterta', () => {
            client.onLine(REMAINS, 'text');

            const [out] = client.onLine(ITEMS, 'text');

            expect(out.toHtml()).toContain('sterty');
        });

        test('a loot line with no body before it is left alone', () => {
            const [out] = client.onLine(ITEMS, 'text');

            expect(out.toHtml()).not.toContain('data-output-clickable');
        });

        test('the body line itself passes through unchanged', () => {
            const [out] = client.onLine(BODY, 'text');

            expect(out.text).toBe(BODY);
        });
    });

    describe('body numbering, for itemCollector', () => {
        test('an "ob N. cialo" command tags the next body', async () => {
            await client.sendCommand('ob 2. cialo');
            client.onLine(REMAINS, 'text');
            client.onLine(ITEMS, 'text');

            expect(getBodyStertyMap().get(2)).toBe(1);
        });

        test('a plain "ob cialo" tags it as unnumbered', async () => {
            await client.sendCommand('ob cialo');
            client.onLine(REMAINS, 'text');
            client.onLine(ITEMS, 'text');

            expect(getBodyStertyMap().get(null)).toBe(1);
        });

        test('sterty are numbered in the order they are seen', () => {
            client.onLine(REMAINS, 'text');
            client.onLine(ITEMS, 'text');
            client.onLine(REMAINS, 'text');
            client.onLine(ITEMS, 'text');

            expect([...getBodyStertyMap().values()]).toContain(2);
        });
    });

    describe('room contents', () => {
        function contents(text: string) {
            client.onLine(text, 'room.contents.object');
        }

        test('bodies are counted', () => {
            contents('cialo wielkiego szczura, cialo goblina');

            expect(getRoomContents().bodies).toBe(2);
        });

        test('sterta piles are counted separately', () => {
            contents('sterta szczatkow, cialo goblina');

            expect(getRoomContents().sterta).toBe(1);
            expect(getRoomContents().bodies).toBe(1);
        });

        test('anything else is a ground item, lowercased', () => {
            contents('Zloty pierscien, skorzany buklak');

            expect(getRoomContents().groundItems.map(i => i.name)).toEqual([
                'zloty pierscien',
                'skorzany buklak',
            ]);
        });

        test('a trailing " i " list is split correctly', () => {
            contents('zloty pierscien i skorzany buklak.');

            expect(getRoomContents().groundItems).toHaveLength(2);
        });

        test('the line is left in the output', () => {
            const [out] = client.onLine('cialo goblina', 'room.contents.object');

            expect(out.text).toBe('cialo goblina');
        });
    });

    describe('popup mode', () => {
        test('loot is announced to the popup instead of being rewritten', () => {
            const seen: any[] = [];
            const off = client.on('loot.popup.open', (p: any) => { seen.push(p); });
            setLootPopupMode(true);

            client.onLine(BODY, 'text');
            const [out] = client.onLine(ITEMS, 'text');
            off();

            expect(seen).toHaveLength(1);
            expect(seen[0].description).toBe('wielkiego szczura');
            expect(seen[0].items.map((i: any) => i.fullName)).toContain('zloty pierscien');
            expect(out.toHtml()).not.toContain('data-output-clickable');
        });

        test('a body with no loot line still reaches the popup', () => {
            const seen: any[] = [];
            const off = client.on('loot.popup.open', (p: any) => { seen.push(p); });
            setLootPopupMode(true);

            client.onLine(BODY, 'text');
            client.onLine(BODY, 'text');
            off();

            expect(seen).toHaveLength(1);
            expect(seen[0].items).toEqual([]);
        });

        test('closing the popup leaves popup mode', () => {
            setLootPopupMode(true);
            eventBus.emit('loot.popup.closed');

            const seen: any[] = [];
            const off = client.on('loot.popup.open', (p: any) => { seen.push(p); });
            client.onLine(BODY, 'text');
            client.onLine(ITEMS, 'text');
            off();

            expect(seen).toEqual([]);
        });
    });

    describe('leaving the room', () => {
        test('room state is reset and the clear is announced', () => {
            client.onLine('cialo goblina', 'room.contents.object');
            let cleared = false;
            const off = client.on('loot.cleared', () => { cleared = true; });

            client.sendEvent('enterLocation', {} as any);
            off();

            expect(getRoomContents()).toEqual({ bodies: 0, sterta: 0, groundItems: [] });
            expect(cleared).toBe(true);
        });

        test('leaving an empty room announces nothing', () => {
            let cleared = false;
            const off = client.on('loot.cleared', () => { cleared = true; });

            client.sendEvent('enterLocation', {} as any);
            off();

            expect(cleared).toBe(false);
        });
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
    });
});

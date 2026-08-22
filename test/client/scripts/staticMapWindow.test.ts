import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';
import initStaticMapWindow from '@client/scripts/staticMapWindow';

function createClient(printed: string[]): Client {
    return new Client({
        send: () => {},
        output: (out?: string | AnsiAwareBuffer) => {
            printed.push(typeof out === 'string' ? out : (out?.text ?? ''));
        },
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

function area(id: number, name: string) {
    return { getAreaId: () => id, getAreaName: () => name };
}

describe('staticMapWindow', () => {
    let client: Client;
    let printed: string[];
    let opened: any[];
    let off: () => void;

    function output() {
        client.sendEvent('output-sent', 1);
        return printed.join('');
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        opened = [];
        client = createClient(printed);
        off = eventBus.on('staticmap.popup.open', (p: any) => { opened.push(p); });
        initStaticMapWindow(client, client.aliases);
    });

    afterEach(() => {
        off();
        delete (globalThis as any).embedded;
    });

    test('/mapa opens at the current room', async () => {
        Object.defineProperty(client.Map, 'currentRoom', { value: { id: 123 }, configurable: true });

        await client.sendCommand('/mapa');

        expect(opened).toEqual([{ roomId: 123 }]);
    });

    test('/mapa <id> opens at that room', async () => {
        await client.sendCommand('/mapa 456');

        expect(opened).toEqual([{ roomId: 456 }]);
    });

    test('/mapa <name> opens the area by exact name', async () => {
        (globalThis as any).embedded = { reader: { getAreas: () => [area(9, 'Wyzima'), area(10, 'Novigrad')] } };

        await client.sendCommand('/mapa Novigrad');

        expect(opened).toEqual([{ areaId: 10 }]);
    });

    test('name matching is case-insensitive', async () => {
        (globalThis as any).embedded = { reader: { getAreas: () => [area(9, 'Wyzima')] } };

        await client.sendCommand('/mapa wyzima');

        expect(opened).toEqual([{ areaId: 9 }]);
    });

    test('a partial name still finds the area', async () => {
        (globalThis as any).embedded = { reader: { getAreas: () => [area(9, 'Wyzima Dolne Miasto')] } };

        await client.sendCommand('/mapa dolne');

        expect(opened).toEqual([{ areaId: 9 }]);
    });

    test('an unknown area is reported', async () => {
        (globalThis as any).embedded = { reader: { getAreas: () => [area(9, 'Wyzima')] } };

        await client.sendCommand('/mapa Brokilon');

        expect(opened).toEqual([]);
        expect(output()).toContain('Nie znaleziono obszaru: Brokilon');
    });

    test('it says so when the map is not loaded', async () => {
        await client.sendCommand('/mapa Wyzima');

        expect(opened).toEqual([]);
        expect(output()).toContain('Mapa nie jest zaladowana');
    });
});

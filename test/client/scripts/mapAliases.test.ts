import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage, globalStorage } from '@modules/core/storage';
import initShortcuts from '@client/scripts/shortcuts';
import initMapAliases from '@client/scripts/mapAliases';

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

const room = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
    id, name, area: 7, env: 1, x: 0, y: 0, z: 0, exits: {}, userData: {}, ...extra,
});

describe('mapAliases', () => {
    let client: Client;
    let printed: string[];
    let commands: string[];
    let offCommand: () => void;
    let rooms: Record<number, any>;

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    function installMap(withReader = true) {
        rooms = {
            1: room(1, 'Rynek w Wyzimie', { exits: { north: 2 } }),
            2: room(2, 'Ulica Dluga', { exits: { south: 1 } }),
            3: room(3, 'Karczma pod Lisem'),
        };
        const reader: any = {
            getRooms: () => Object.values(rooms),
            getRoom: (id: number) => rooms[id],
            getArea: () => ({ getAreaName: () => 'Wyzima' }),
            getColorValue: () => '#123456',
        };
        vi.spyOn(client.Map, 'tryGetMapReader').mockReturnValue(withReader ? reader : null as any);
        vi.spyOn(client.Map, 'getAreaName').mockReturnValue('Wyzima');
        vi.spyOn(client.Map, 'getRoomById').mockImplementation((id: number) => rooms[id]);
        vi.spyOn(client.Map, 'findPath').mockImplementation((from: number, to: number) =>
            (from === to ? [from] : [from, to]) as any);
    }

    function standIn(id: number | null) {
        Object.defineProperty(client.Map, 'currentRoom', {
            value: id === null ? undefined : rooms[id],
            configurable: true,
        });
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        commands = [];
        client = createClient(printed);
        const sink = commands;
        offCommand = client.on('command', (c: string) => { sink.push(c); });
        initShortcuts(client, client.aliases);
        globalStorage.set('shortcuts', [] as any);
        initMapAliases(client, client.aliases);
        installMap();
        standIn(1);
    });

    afterEach(() => {
        offCommand();
        vi.restoreAllMocks();
    });

    describe('simple map commands', () => {
        test('/cofnij steps the mapper back', async () => {
            const moveBack = vi.spyOn(client.Map, 'moveBack').mockImplementation(() => {});

            await client.sendCommand('/cofnij');

            expect(moveBack).toHaveBeenCalled();
        });

        test('/move walks the mapper', async () => {
            const move = vi.spyOn(client.Map, 'move').mockImplementation(() => {});

            await client.sendCommand('/move polnoc');

            expect(move).toHaveBeenCalledWith('polnoc');
        });

        test('/ustaw places you on a room by id', async () => {
            const setRoom = vi.spyOn(client.Map, 'setMapRoomById').mockImplementation(() => {});

            await client.sendCommand('/ustaw 42');

            expect(setRoom).toHaveBeenCalledWith(42);
        });

        test('/zlok refreshes the position', async () => {
            const refresh = vi.spyOn(client.Map, 'refresh').mockReturnValue(true as any);

            await client.sendCommand('/zlok');

            expect(refresh).toHaveBeenCalled();
        });
    });

    describe('/prowadz', () => {
        test('a numeric id becomes a lead target', async () => {
            let target: number | null = null;
            const off = client.on('leadTo', (id: number) => { target = id; });

            await client.sendCommand('/prowadz 42');
            off();

            expect(target).toBe(42);
        });

        test('a saved shortcut name resolves to its room', async () => {
            await client.sendCommand('/dodaj_skrot 77 bank Bank');
            let target: number | null = null;
            const off = client.on('leadTo', (id: number) => { target = id; });

            await client.sendCommand('/prowadz bank');
            off();

            expect(target).toBe(77);
        });

        test('a quoted name with spaces works', async () => {
            await client.sendCommand('/dodaj_skrot 88 "bank w wyzimie"');
            let target: number | null = null;
            const off = client.on('leadTo', (id: number) => { target = id; });

            await client.sendCommand('/prowadz "bank w wyzimie"');
            off();

            expect(target).toBe(88);
        });

        test('an unknown name is reported', async () => {
            await client.sendCommand('/prowadz nieistniejace');

            expect(output()).toContain("Nie znaleziono celu prowadzenia dla 'nieistniejace'.");
        });

        test('/prowadz- clears the lead', async () => {
            let cleared = false;
            const off = client.on('clearLeadTo', () => { cleared = true; });

            await client.sendCommand('/prowadz-');
            off();

            expect(cleared).toBe(true);
        });
    });

    describe('/go', () => {
        test('walks one step towards the first destination', async () => {
            Object.defineProperty(client.Map, 'destinations', { value: [2], configurable: true });

            await client.sendCommand('/go');

            expect(commands).toContain('n');
        });

        test('does nothing without a destination', async () => {
            Object.defineProperty(client.Map, 'destinations', { value: [], configurable: true });

            await client.sendCommand('/go');

            expect(commands).toEqual([]);
        });

        test('does nothing when the next room is not an exit', async () => {
            Object.defineProperty(client.Map, 'destinations', { value: [3], configurable: true });

            await client.sendCommand('/go');

            expect(commands).toEqual([]);
        });
    });

    describe('/info', () => {
        test('describes the current room', async () => {
            await client.sendCommand('/info');

            const out = output();
            expect(out).toContain('Rynek w Wyzimie');
            expect(out).toContain('Wyzima');
        });

        test('describes another room by id', async () => {
            await client.sendCommand('/info 3');

            expect(output()).toContain('Karczma pod Lisem');
        });

        test('an unknown id is reported', async () => {
            await client.sendCommand('/info 999');

            expect(output()).toContain('Nie znaleziono lokacji o id 999.');
        });

        test('without a location it says so', async () => {
            standIn(null);

            await client.sendCommand('/info');

            expect(output()).toContain('Brak aktualnej lokalizacji.');
        });
    });

    describe('/note', () => {
        test('opens the note editor for the current room', async () => {
            let payload: any = null;
            const off = client.on('locationNote.open', (p: any) => { payload = p; });

            await client.sendCommand('/note');
            off();

            expect(payload).toEqual({ roomId: 1 });
        });

        test('without a location it says so', async () => {
            standIn(null);

            await client.sendCommand('/note');

            expect(output()).toContain('Brak aktualnej lokalizacji.');
        });
    });

    describe('/przeszukaj', () => {
        test('lists rooms whose name matches', async () => {
            await client.sendCommand('/przeszukaj karczma');

            const out = output();
            expect(out).toContain("Wyniki przeszukiwania 'karczma'");
            expect(out).toContain('Karczma pod Lisem');
        });

        test('matching is case-insensitive', async () => {
            await client.sendCommand('/przeszukaj RYNEK');

            expect(output()).toContain('Rynek w Wyzimie');
        });

        test('results are clickable', async () => {
            client.sendEvent('output-sent', 1);
            printed.length = 0;
            await client.sendCommand('/przeszukaj karczma');
            client.sendEvent('output-sent', 1);

            expect(printed.join('')).toContain('Karczma');
        });

        test('nothing happens without a loaded map', async () => {
            installMap(false);

            await client.sendCommand('/przeszukaj karczma');

            expect(output()).toBe('');
        });
    });
});

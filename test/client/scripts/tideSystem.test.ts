import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initTideSystem from '@client/scripts/tideSystem';

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

// A couple of the real tide rooms plus the neighbour that links into them.
const TIDE_ROOM = 18975;
const OTHER_TIDE_ROOM = 18990;
const SHIFT_ONLY = 20808;
const NEIGHBOUR = 3287;
const TEMP_OFFSET = 100000;

function makeRoom(id: number, extra: Record<string, unknown> = {}) {
    return {
        id, area: 7, areaId: '7', x: 0, y: 0, z: 0, weight: 1,
        hash: `hash-${id}`, roomChar: '', env: 1, name: `room ${id}`,
        exits: {}, userData: {},
        ...extra,
    } as any;
}

describe('tideSystem', () => {
    let client: Client;
    let printed: string[];
    let rooms: Record<number, any>;

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    function installMap(withReader = true) {
        rooms = {
            [TIDE_ROOM]: makeRoom(TIDE_ROOM, { exits: { north: OTHER_TIDE_ROOM, west: NEIGHBOUR } }),
            [OTHER_TIDE_ROOM]: makeRoom(OTHER_TIDE_ROOM, { exits: { south: TIDE_ROOM } }),
            [SHIFT_ONLY]: makeRoom(SHIFT_ONLY),
            [NEIGHBOUR]: makeRoom(NEIGHBOUR, { exits: { east: TIDE_ROOM } }),
        };
        // The renderer's Area wraps the raw area data, and the script pushes new
        // surface rooms into `area.area.rooms`.
        const area = {
            markDirty: vi.fn(), planes: [], exits: new Map(),
            createPlanes: () => [], createExits: () => {},
            area: { rooms: [] as any[] },
        };
        const reader: any = {
            rooms,
            areas: { 7: area },
            getRooms: () => Object.values(rooms),
            getRoom: (id: number) => rooms[id],
        };
        (client.Map as any).hashes = Object.fromEntries(
            Object.values(rooms).map((r: any) => [r.hash, r.id])
        );
        vi.spyOn(client.Map, 'tryGetMapReader').mockReturnValue(withReader ? reader : null as any);
        vi.spyOn(client.Map, 'getMapReader').mockReturnValue(reader);
        vi.spyOn(client.Map, 'renderRoomById').mockImplementation(() => {});
    }

    function standIn(id: number) {
        Object.defineProperty(client.Map, 'currentRoom', { value: rooms[id] ?? { id }, configurable: true });
    }

    async function ensureLowTide() {
        // Module state is shared; toggle off if a previous test left it on.
        standIn(TIDE_ROOM);
        await client.sendCommand('/przyplyw');
        if (!printed.join('').includes('wylaczony')) {
            await client.sendCommand('/przyplyw');
        }
        printed.length = 0;
    }

    beforeEach(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        client = createClient(printed);
        initTideSystem(client, client.aliases);
        installMap();
        await ensureLowTide();
    });

    afterEach(async () => {
        await ensureLowTide();
        vi.restoreAllMocks();
    });

    describe('/przyplyw', () => {
        test('toggles high tide on and off', async () => {
            standIn(TIDE_ROOM);

            await client.sendCommand('/przyplyw');
            expect(output()).toContain('Przyplyw wlaczony.');

            await client.sendCommand('/przyplyw');
            expect(output()).toContain('Przyplyw wylaczony.');
        });

        test('refuses without a loaded map', async () => {
            installMap(false);

            await client.sendCommand('/przyplyw');

            expect(output()).toContain('Mapa nie jest jeszcze zaladowana.');
        });
    });

    describe('what high tide does to the map', () => {
        beforeEach(async () => {
            standIn(TIDE_ROOM);
            await client.sendCommand('/przyplyw');
            output();
        });

        test('affected rooms sink to the underwater level', () => {
            expect(rooms[TIDE_ROOM].z).toBe(-1);
            expect(rooms[SHIFT_ONLY].z).toBe(-1);
        });

        test('a surface room is created above each tide room', () => {
            expect(rooms[TIDE_ROOM + TEMP_OFFSET]).toBeDefined();
            expect(rooms[TIDE_ROOM + TEMP_OFFSET].z).toBe(0);
        });

        test('the surface and underwater rooms are linked vertically', () => {
            expect(rooms[TIDE_ROOM].exits.up).toBe(TIDE_ROOM + TEMP_OFFSET);
            expect(rooms[TIDE_ROOM + TEMP_OFFSET].exits.down).toBe(TIDE_ROOM);
        });

        test('surface exits between tide rooms point at the other surface rooms', () => {
            expect(rooms[TIDE_ROOM + TEMP_OFFSET].exits.north).toBe(OTHER_TIDE_ROOM + TEMP_OFFSET);
        });

        test('the shift-only room gets no surface twin', () => {
            expect(rooms[SHIFT_ONLY + TEMP_OFFSET]).toBeUndefined();
        });

        test('turning it off restores the original levels', async () => {
            await client.sendCommand('/przyplyw');

            expect(rooms[TIDE_ROOM].z).toBe(0);
            expect(rooms[TIDE_ROOM].exits.up).toBeUndefined();
        });

        test('the map is announced as changed', async () => {
            let changed = false;
            const off = client.on('mapDataChanged', () => { changed = true; });

            await client.sendCommand('/przyplyw');
            off();

            expect(changed).toBe(true);
        });
    });

    describe('reacting to the game', () => {
        test('the incoming-tide message raises the tide near the area', () => {
            standIn(NEIGHBOUR);

            client.onLine('Tam, gdzie przed chwila byl suchy lad, jest teraz falujace morze.', 'text');

            expect(rooms[TIDE_ROOM].z).toBe(-1);
        });

        test('it does nothing far from the tide area', () => {
            standIn(999);

            client.onLine('Tam, gdzie przed chwila byl suchy lad, jest teraz falujace morze.', 'text');

            expect(rooms[TIDE_ROOM].z).toBe(0);
        });

        test('the outgoing-tide message lowers it again', () => {
            standIn(NEIGHBOUR);
            client.onLine('Tam, gdzie przed chwila byl suchy lad, jest teraz falujace morze.', 'text');

            client.onLine('Czujesz jak w jednej chwili poziom morza gwaltownie opada.', 'text');

            expect(rooms[TIDE_ROOM].z).toBe(0);
        });

        test('the trigger lines stay visible', () => {
            standIn(NEIGHBOUR);

            const parts = client.onLine('Tam, gdzie przed chwila byl suchy lad, jest teraz falujace morze.', 'text');

            expect(parts).toHaveLength(1);
        });
    });

    describe('reading the tide from the room exits', () => {
        test('"Mozesz stad poplynac" means high tide', () => {
            standIn(TIDE_ROOM);

            client.sendEvent('gmcp_msg.room.exits', { text: 'Mozesz stad poplynac na polnoc i w gore.' } as any);

            expect(rooms[TIDE_ROOM].z).toBe(-1);
        });

        test('exits without it mean low tide again', () => {
            standIn(TIDE_ROOM);
            client.sendEvent('gmcp_msg.room.exits', { text: 'Mozesz stad poplynac na polnoc i w gore.' } as any);

            client.sendEvent('gmcp_msg.room.exits', { text: 'Stad mozesz pojsc na polnoc.' } as any);

            expect(rooms[TIDE_ROOM].z).toBe(0);
        });

        test('exits outside the tide area are ignored', () => {
            standIn(999);

            client.sendEvent('gmcp_msg.room.exits', { text: 'Mozesz stad poplynac na polnoc.' } as any);

            expect(rooms[TIDE_ROOM].z).toBe(0);
        });
    });
});

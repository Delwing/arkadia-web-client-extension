import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initLabyrinth from '@client/scripts/labyrinth';

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

const LABYRINTH_ENV = 266;
const LABYRINTH_AREA = 39;
const LABYRINTH_Z = -1;

/** Two connected labyrinth rooms, 1 -> north -> 2. */
function makeRooms() {
    return {
        1: { id: 1, env: LABYRINTH_ENV, area: LABYRINTH_AREA, z: LABYRINTH_Z, roomChar: '', exits: { north: 2 } },
        2: { id: 2, env: LABYRINTH_ENV, area: LABYRINTH_AREA, z: LABYRINTH_Z, roomChar: '', exits: { south: 1 } },
    } as Record<number, any>;
}

describe('labyrinth', () => {
    let client: Client;
    let printed: string[];
    let rooms: Record<number, any>;
    let areas: Record<number, { markDirty: () => void }>;

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    function installMap(withReader = true) {
        rooms = makeRooms();
        // The script rebuilds the renderer's area planes after editing exits,
        // so the stub has to carry that much of the Area surface.
        areas = {
            [LABYRINTH_AREA]: {
                markDirty: vi.fn(),
                planes: [],
                exits: new Map(),
                createPlanes: () => [],
                createExits: () => {},
            } as any,
        };
        const reader: any = {
            rooms,
            areas,
            getRooms: () => Object.values(rooms),
            getRoom: (id: number) => rooms[id],
        };
        vi.spyOn(client.Map, 'tryGetMapReader').mockReturnValue(withReader ? reader : null as any);
        vi.spyOn(client.Map, 'getMapReader').mockReturnValue(reader);
        vi.spyOn(client.Map, 'renderRoomById').mockImplementation(() => {});
    }

    function standIn(id: number) {
        Object.defineProperty(client.Map, 'currentRoom', { value: rooms[id], configurable: true });
    }

    function walkedFrom(from: number, to: number, direction: string) {
        Object.defineProperty(client.Map, 'locationHistory', { value: [from, to], configurable: true });
        standIn(to);
        client.sendEvent('enterLocation', { id: to, direction } as any);
    }

    beforeEach(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        client = createClient(printed);
        initLabyrinth(client, client.aliases);
        installMap();
        // Module state is a singleton — make sure we start deactivated.
        client.sendEvent('clock.sunrise', {} as any);
        printed.length = 0;
    });

    afterEach(() => {
        client.sendEvent('clock.sunrise', {} as any);
        vi.restoreAllMocks();
    });

    describe('/labirynt', () => {
        test('turns the mode on and off', async () => {
            await client.sendCommand('/labirynt');
            expect(output()).toContain('Tryb labiryntu wlaczony.');

            await client.sendCommand('/labirynt');
            expect(output()).toContain('Tryb labiryntu wylaczony.');
        });

        test('refuses to start without a loaded map', async () => {
            installMap(false);

            await client.sendCommand('/labirynt');

            expect(output()).toContain('Mapa nie jest jeszcze zaladowana.');
        });
    });

    describe('learning blocked exits', () => {
        beforeEach(async () => {
            await client.sendCommand('/labirynt');
            output();
        });

        test('a hedge message removes the exit you just tried', () => {
            walkedFrom(1, 2, 'north');

            client.onLine('Ruszasz na polnoc, ale zaraz wchodzisz w gesta platanine galezi i lisci zywoplotow.', 'text');

            expect(rooms[1].exits.north).toBeUndefined();
        });

        test('the hedge line itself stays visible', () => {
            walkedFrom(1, 2, 'north');

            const parts = client.onLine('Ruszasz na polnoc, ale zaraz wchodzisz w gesta platanine galezi i lisci zywoplotow.', 'text');

            expect(parts).toHaveLength(1);
        });

        test('a confirmed room change means the move succeeded', () => {
            walkedFrom(1, 2, 'north');
            client.sendEvent('gmcp.room.info', {} as any);

            client.onLine('Ruszasz na polnoc, ale zaraz wchodzisz w gesta platanine galezi i lisci zywoplotow.', 'text');

            expect(rooms[1].exits.north).toBe(2);
        });

        test('the demon blocker is inconclusive and removes nothing', () => {
            walkedFrom(1, 2, 'north');

            client.onLine('Nie mozesz sie tam udac, gdyz ktos lapie cie kurczowo za nogawke.', 'text');

            expect(rooms[1].exits.north).toBe(2);
        });

        test('turning the mode off restores the removed exits', async () => {
            walkedFrom(1, 2, 'north');
            client.onLine('Ruszasz na polnoc, ale zaraz wchodzisz w gesta platanine galezi i lisci zywoplotow.', 'text');
            expect(rooms[1].exits.north).toBeUndefined();

            await client.sendCommand('/labirynt');

            expect(rooms[1].exits.north).toBe(2);
        });

        test('sunrise turns the mode off, because the labyrinth resets', async () => {
            // `isActive` is module-level state shared by every client, so assert
            // the mode flag rather than this client's room objects — the handler
            // that flips it may belong to an earlier test's client.
            client.sendEvent('clock.sunrise', {} as any);

            await client.sendCommand('/labirynt');

            expect(output()).toContain('Tryb labiryntu wlaczony.');
        });
    });

    describe('walking through a removed exit', () => {
        test('the exit is restored for the duration of the command', async () => {
            await client.sendCommand('/labirynt');
            walkedFrom(1, 2, 'north');
            client.onLine('Ruszasz na polnoc, ale zaraz wchodzisz w gesta platanine galezi i lisci zywoplotow.', 'text');
            standIn(1);
            expect(rooms[1].exits.north).toBeUndefined();

            await client.sendCommand('polnoc');

            // The hook puts it back so the mapper's move/moveBack still works.
            expect(rooms[1].exits.north).toBe(2);
        });

        test('the hook does nothing while the mode is off', async () => {
            standIn(1);
            delete rooms[1].exits.north;

            await client.sendCommand('polnoc');

            expect(rooms[1].exits.north).toBeUndefined();
        });
    });

    describe('marking rooms where you fought', () => {
        test('a combat line marks the current labyrinth room', async () => {
            await client.sendCommand('/labirynt');
            standIn(1);

            client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(rooms[1].roomChar).toBe('⚔');
        });

        test('nothing is marked while the mode is off', () => {
            standIn(1);

            client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(rooms[1].roomChar).toBe('');
        });

        test('a non-combat line marks nothing', async () => {
            await client.sendCommand('/labirynt');
            standIn(1);

            client.onLine('Ranisz wielkiego szczura.', 'text');

            expect(rooms[1].roomChar).toBe('');
        });
    });
});

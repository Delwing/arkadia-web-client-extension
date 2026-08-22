import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setGmcp } from '@client/gmcp';
import initLabyrinthMapper from '@client/scripts/rindeLabyrinthMapper';

function createClient(printed: string[], gmcpSent: any[]): Client {
    return new Client({
        send: () => {},
        output: (out?: string | AnsiAwareBuffer) => {
            printed.push(typeof out === 'string' ? out : (out?.text ?? ''));
        },
        sendGmcp: (type: string, payload?: any) => { gmcpSent.push({ type, payload }); },
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

const ENTRANCE_ROOM_ID = 25344;
const LABYRINTH_MAP_ROOM_ID = 19494;
const TEMP_ID_OFFSET = 200000;
const LABYRINTH_AREA_ID = 9999;

// The pattern needs a word between "tutaj" and "widoczne", as the game prints.
const exitLine = (dirs: string) => `Sa tutaj dwa widoczne wyjscia: ${dirs}.`;

describe('rindeLabyrinthMapper', () => {
    let client: Client;
    let printed: string[];
    let gmcpSent: any[];
    let rooms: Record<number, any>;
    let areas: Record<number, any>;

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    function makeArea() {
        return {
            markDirty: vi.fn(), planes: [], exits: new Map(),
            createPlanes: () => [], createExits: () => {},
            area: { rooms: [] as any[] },
            getAreaName: () => 'Labirynt',
        };
    }

    function installMap(withReader = true) {
        rooms = {};
        areas = { [LABYRINTH_AREA_ID]: makeArea() };
        const reader: any = {
            rooms,
            areas,
            getRooms: () => Object.values(rooms),
            getRoom: (id: number) => rooms[id],
        };
        (client.Map as any).hashes = {};
        vi.spyOn(client.Map, 'tryGetMapReader').mockReturnValue(withReader ? reader : null as any);
        vi.spyOn(client.Map, 'getMapReader').mockReturnValue(reader);
        vi.spyOn(client.Map, 'renderRoomById').mockImplementation(() => {});
    }

    function standIn(id: number) {
        Object.defineProperty(client.Map, 'currentRoom', { value: { id }, configurable: true });
    }

    /** Walk into the labyrinth so the mapper auto-activates. */
    function enterLabyrinth() {
        client.sendEvent('enterLocation', { id: LABYRINTH_MAP_ROOM_ID } as any);
    }

    // The mapper keeps its fingerprint->room map at module scope, so a
    // description seen by an earlier test is not "new" any more. Make every
    // test's descriptions unique.
    let nonce = 0;
    const desc = (text: string) => `${text} (wariant ${nonce})`;

    /** Feed one room: the gmcp room info, its description, then its exits. */
    function visitRoom(description: string, dirs = 'polnoc') {
        client.sendEvent('gmcp.room.info', {} as any);
        client.onLine(desc(description), 'text');
        client.onLine(exitLine(dirs), 'text');
    }

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        nonce++;
        printed = [];
        gmcpSent = [];
        client = createClient(printed, gmcpSent);
        initLabyrinthMapper(client, client.aliases);
        installMap();
        printed.length = 0;
    });

    afterEach(async () => {
        // Module state is a singleton — leave the mapper off for the next test.
        client.sendEvent('gmcp.room.info', { map: { x: 1 } } as any);
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('/labirynt_mapa', () => {
        test('turns the mapper on', async () => {
            await client.sendCommand('/labirynt_mapa');

            const out = output();
            expect(out).toContain('[Labirynt] Mapper wlaczony.');
            expect(out).toContain('Wejdz do labiryntu aby rozpoczac mapowanie.');
        });

        test('turns it off again', async () => {
            await client.sendCommand('/labirynt_mapa');
            output();

            await client.sendCommand('/labirynt_mapa');

            expect(output()).toContain('wylaczony');
        });

        test('refuses without a loaded map', async () => {
            installMap(false);

            await client.sendCommand('/labirynt_mapa');

            expect(output()).toContain('Mapa nie jest jeszcze zaladowana.');
        });
    });

    describe('preparing to descend', () => {
        test('going down at the entrance asks the server for long descriptions', async () => {
            setGmcp('char.options', { brief: 2 });
            standIn(ENTRANCE_ROOM_ID);

            await client.sendCommand('dol');

            expect(gmcpSent).toContainEqual({ type: 'char.options', payload: { brief: 0 } });
        });

        test('going down elsewhere changes nothing', async () => {
            standIn(999);

            await client.sendCommand('dol');

            expect(gmcpSent).toEqual([]);
        });

        test('another direction at the entrance changes nothing', async () => {
            standIn(ENTRANCE_ROOM_ID);

            await client.sendCommand('polnoc');

            expect(gmcpSent).toEqual([]);
        });
    });

    describe('auto-activating in the labyrinth', () => {
        test('entering the labyrinth room starts the mapper', () => {
            enterLabyrinth();

            expect(output()).toContain('[Labirynt] Mapper wlaczony.');
        });

        test('a placeholder room is put on the map', () => {
            enterLabyrinth();

            expect(Object.keys(rooms).length).toBeGreaterThan(0);
            expect(Object.values(rooms)[0].area).toBe(LABYRINTH_AREA_ID);
        });

        test('the map view is moved there, deferred by a tick', () => {
            const render = vi.spyOn(client.Map, 'renderRoomById');
            enterLabyrinth();
            render.mockClear();

            vi.runAllTimers();

            expect(render).toHaveBeenCalled();
        });

        test('entering any other room does not start it', () => {
            client.sendEvent('enterLocation', { id: 12345 } as any);

            expect(output()).not.toContain('Mapper wlaczony');
        });
    });

    describe('mapping rooms', () => {
        beforeEach(() => {
            enterLabyrinth();
            vi.runAllTimers();
            output();
        });

        test('a described room with exits becomes a mapped room', () => {
            const before = Object.keys(rooms).length;

            visitRoom('Ciemny korytarz z omszalymi scianami.', 'polnoc i poludnie');

            expect(Object.keys(rooms).length).toBeGreaterThanOrEqual(before);
        });

        test('two different descriptions map to two rooms', async () => {
            visitRoom('Ciemny korytarz z omszalymi scianami.', 'polnoc');
            // The mapper links rooms by the direction you walked, so issue one.
            await client.sendCommand('polnoc');
            visitRoom('Waska sala ze zwalonym stropem.', 'poludnie');

            const labyrinthRooms = Object.values(rooms).filter((r: any) => r.id >= TEMP_ID_OFFSET);
            expect(labyrinthRooms.length).toBeGreaterThanOrEqual(2);
        });

        test('the same description is recognised as the same room', () => {
            visitRoom('Ciemny korytarz z omszalymi scianami.', 'polnoc');
            const after1 = Object.values(rooms).filter((r: any) => r.id >= TEMP_ID_OFFSET).length;

            visitRoom('Ciemny korytarz z omszalymi scianami.', 'polnoc');
            const after2 = Object.values(rooms).filter((r: any) => r.id >= TEMP_ID_OFFSET).length;

            expect(after2).toBe(after1);
        });

        test('description lines stay visible', () => {
            client.sendEvent('gmcp.room.info', {} as any);

            const parts = client.onLine(desc('Ciemny korytarz z omszalymi scianami.'), 'text');

            expect(parts).toHaveLength(1);
        });

        test('a well in the description becomes clickable', () => {
            client.sendEvent('gmcp.room.info', {} as any);

            const [out] = client.onLine(desc('Posrodku sali znajduje sie studnia.'), 'text');

            expect(out.toHtml()).toContain('data-output-clickable');
            expect(out.toHtml()).toContain('wejdz do studni');
        });

        test('a room with map coordinates means you have left the labyrinth', () => {
            client.sendEvent('gmcp.room.info', { map: { x: 1, y: 2 } } as any);

            expect(output()).toContain('wylaczony');
        });
    });
});

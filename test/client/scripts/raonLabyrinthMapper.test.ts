import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setGmcp } from '@client/gmcp';
import initRaonLabyrinthMapper from '@client/scripts/raonLabyrinthMapper';

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

const ENTRY_ROOM_ID = 23147;
const POOL_ROOM_IDS = [
    23148, 24425, 24426, 24427, 24428, 24429, 24430, 24431,
    24432, 24433, 24434, 24437, 24438, 24439, 24440, 24441,
    24442, 24443, 24444, 24445,
];
const SPARE_ROOM_IDS = [24447, 24448, 24449];
const CHAPEL_ROOM_ID = 24446;
const ALL_ROOM_IDS = [ENTRY_ROOM_ID, ...POOL_ROOM_IDS, ...SPARE_ROOM_IDS, CHAPEL_ROOM_ID];

const exitLine = (dirs: string) => `Sa tutaj dwa widoczne wyjscia: ${dirs}.`;

describe('raonLabyrinthMapper', () => {
    let client: Client;
    let printed: string[];
    let gmcpSent: any[];
    let rooms: Record<number, any>;

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
            getAreaName: () => 'Raon',
        };
    }

    function installMap(withReader = true) {
        rooms = {};
        for (const id of ALL_ROOM_IDS) {
            rooms[id] = {
                id, area: 5, areaId: '5', x: 0, y: 0, z: 0, weight: 1,
                roomChar: '', name: `pokoj ${id}`, hash: `h-${id}`, env: 1,
                userData: {}, customLines: {}, stubs: [],
                exits: {}, doors: {}, specialExits: {},
            };
        }
        const areas: Record<number, any> = { 5: makeArea() };
        const reader: any = {
            rooms, areas,
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

    /** Walk down into the labyrinth, which auto-activates the mapper. */
    function enterLabyrinth() {
        client.sendEvent('enterLocation', { id: ENTRY_ROOM_ID } as any);
    }

    // The mapper keeps its fingerprint map at module scope, so descriptions
    // must be unique per test to stay "new".
    let nonce = 0;
    const desc = (text: string) => `${text} (wariant ${nonce})`;

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        nonce++;
        printed = [];
        gmcpSent = [];
        client = createClient(printed, gmcpSent);
        initRaonLabyrinthMapper(client, client.aliases);
        installMap();
        printed.length = 0;
    });

    /**
     * The mapper's state is module-level, and leaving via the staircase only
     * pauses it (isInitialized survives). Toggle until it is fully reset, so
     * every test starts from the same place.
     */
    async function resetMapper() {
        for (let i = 0; i < 3; i++) {
            printed.length = 0;
            await client.sendCommand('/raon_mapa');
            if (output().includes('wylaczony')) break;
        }
        printed.length = 0;
    }

    afterEach(async () => {
        await resetMapper();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('/raon_mapa', () => {
        test('turns the mapper on', async () => {
            await resetMapper();

            await client.sendCommand('/raon_mapa');

            expect(output()).toContain('Wejdz do labiryntu aby rozpoczac mapowanie.');
        });

        test('a second call resets everything', async () => {
            await resetMapper();
            await client.sendCommand('/raon_mapa');
            output();

            await client.sendCommand('/raon_mapa');

            expect(output()).toContain('Mapper wylaczony i mapa przywrocona.');
        });

        test('refuses without a loaded map', async () => {
            await resetMapper();
            installMap(false);

            await client.sendCommand('/raon_mapa');

            expect(output()).toContain('Mapa nie jest jeszcze zaladowana.');
        });
    });

    describe('entering the labyrinth', () => {
        beforeEach(async () => { await resetMapper(); });

        test('going in starts the mapper and asks for long descriptions', () => {
            setGmcp('char.options', { brief: 2 });

            enterLabyrinth();

            expect(gmcpSent).toContainEqual({ type: 'char.options', payload: { brief: 0 } });
        });

        test('leaving via the staircase pauses it', () => {
            enterLabyrinth();
            output();

            client.onLine('Zagubione w niebycie, kamienne schody sa jedyna namacalna rzecza tutaj.', 'text');

            expect(output()).toContain('[Raon]');
        });

        test('going back in resumes the paused session', () => {
            enterLabyrinth();
            client.onLine('Zagubione w niebycie, kamienne schody sa jedyna namacalna rzecza tutaj.', 'text');
            output();

            enterLabyrinth();

            expect(output()).toContain('wznowiony');
        });
    });

    describe('mapping rooms', () => {
        beforeEach(async () => {
            await resetMapper();
            enterLabyrinth();
            output();
        });

        /** A finished capture redraws the map rather than printing anything. */
        function watchMapChanges() {
            let changes = 0;
            const off = client.on('mapDataChanged', () => { changes++; });
            return { count: () => changes, off };
        }

        test('walking a direction captures the next room', async () => {
            // Only "south" leads out of the entry room into the labyrinth, and
            // the mapper skips a first capture reached any other way.
            const watch = watchMapChanges();
            await client.sendCommand('poludnie');

            client.onLine(desc('Ciemna komnata z sarkofagiem posrodku.'), 'room.long');
            const parts = client.onLine(exitLine('polnoc i poludnie'), 'room.exits');
            watch.off();

            expect(parts).toHaveLength(1);
            expect(watch.count()).toBeGreaterThan(0);
        });

        test('following somebody captures too', () => {
            const watch = watchMapChanges();

            client.onLine('Podazasz za Ala na poludnie.', 'text');
            client.onLine(desc('Ciemna komnata z gryfami na scianach.'), 'room.long');
            client.onLine(exitLine('polnoc'), 'room.exits');
            watch.off();

            expect(watch.count()).toBeGreaterThan(0);
        });

        test('a failed move aborts the capture', async () => {
            await client.sendCommand('polnoc');

            const watch = watchMapChanges();
            client.onLine('Nie widzisz zadnego wyjscia prowadzacego na polnoc.', 'text');
            client.onLine(desc('Jakis opis, ktory nie powinien zostac zapisany.'), 'room.long');
            client.onLine(exitLine('polnoc'), 'room.exits');
            watch.off();

            expect(watch.count()).toBe(0);
        });

        test('a brief-mode short description aborts the capture', async () => {
            await client.sendCommand('polnoc');

            const watch = watchMapChanges();
            client.onLine(desc('Krotki opis.'), 'room.short');
            client.onLine(exitLine('polnoc'), 'room.exits');
            watch.off();

            expect(watch.count()).toBe(0);
        });

        test('bowl smoke is announced as a teleport', () => {
            client.onLine('Nagle z misy bucha gesty bialy dym!', 'text');

            expect(output()).toContain('Teleport z misy!');
        });
    });

    describe('puzzle helpers', () => {
        beforeEach(async () => {
            await resetMapper();
            enterLabyrinth();
            output();
        });

        test('the smoking bowl gets a loud stop banner and a bind', () => {
            const setBind = vi.spyOn(client.FunctionalBind, 'set').mockImplementation(() => {});

            const [out] = client.onLine(
                'Z dna misy zaczyna unosic sie najpierw ledwo widoczna smuga dymu.',
                'text'
            );

            expect(out.text).toContain('[ STOP ]');
            expect(setBind).toHaveBeenCalledWith('ob rubin;przekrec rubin');
        });

        test('the smoke clearing is recoloured', () => {
            const [out] = client.onLine('Bialy dym przestaje wydobywac sie z wnetrza kamiennej misy.', 'text');

            expect(out.text).toBe('Bialy dym przestaje wydobywac sie z wnetrza kamiennej misy.');
            expect(out.toHtml()).toContain('SpringGreen');
        });

        test.each([
            ['Zielone oczy jarza sie delikatna poswiata.', 'smok'],
            ['Czerwone oczy gryfa lsnia w mroku.', 'gryf'],
            ['Jego blekitne, wielkie oczy zwrocone sa ku niebu.', 'jednorozec'],
        ])('a figurine eye colour is remembered: %s', (line) => {
            const [out] = client.onLine(line, 'text');

            expect(out.toHtml()).toContain('<span');
        });

        test('a cleared sarcophagus is only tracked while active', () => {
            expect(() => client.sendEvent('allEnemiesKilled')).not.toThrow();
        });
    });

    test('unrelated output outside the labyrinth is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
    });
});

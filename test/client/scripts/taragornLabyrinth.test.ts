import initTaragornLabyrinth, {
    matchTaragornRooms,
    parseDoorUp,
    parseGrateDirections,
    readGmcpExits,
    TARAGORN_ROOM_IDS,
} from '@client/scripts/taragornLabyrinth';
import Triggers from '@client/Triggers';
import {AnsiAwareBuffer} from '@client/ansi/FormatState';
import {setGmcp} from '@client/gmcp';

const TEMPLE_ROOM_ID = 24525;
const CATAFALQUE_ROOM_ID = 26298;

// Skeleton straight from the published map: every pool room, the rooms its
// passages lead to, and where it sits on the grid.
const SKELETON: Record<number, { x: number; y: number; exits: Record<string, number> }> = {
    25648: {x: 60, y: 78, exits: {southeast: 25649, northwest: 25650}},
    25649: {x: 62, y: 80, exits: {east: 26299, southwest: 25655, west: 25648, northwest: 26296}},
    25650: {x: 58, y: 76, exits: {north: 25652, southeast: 25648, west: 25651, northwest: 26299}},
    25651: {x: 56, y: 76, exits: {north: 25653, northeast: 25656, east: 25650, southwest: 25654}},
    25652: {x: 58, y: 74, exits: {northeast: 26295, south: 25650, southwest: 26297, west: 25653}},
    25653: {x: 56, y: 74, exits: {east: 25652, southeast: 25659, south: 25651, northwest: 25657}},
    25654: {x: 54, y: 78, exits: {northeast: 25651, southwest: 25655}},
    25655: {x: 52, y: 80, exits: {north: 25654, northeast: 25649, south: 25656, northwest: 25658}},
    25656: {x: 52, y: 82, exits: {north: 25655, south: 25651}},
    25657: {x: 54, y: 72, exits: {southeast: 25653, northwest: 25658}},
    25658: {x: 52, y: 70, exits: {northeast: 26296, east: 25657, southeast: 25655, west: 25659}},
    25659: {x: 50, y: 70, exits: {east: 25658, west: 25653}},
    26295: {x: 60, y: 72, exits: {northeast: 26296, southwest: 25652}},
    26296: {x: 62, y: 70, exits: {north: 26297, southeast: 25649, south: 26295, southwest: 25658}},
    26297: {x: 62, y: 68, exits: {north: 25652, south: 26296}},
    26299: {x: 64, y: 80, exits: {east: 25650, west: 25649, up: TEMPLE_ROOM_ID}},
};

function buildRooms(): Record<number, any> {
    const rooms: Record<number, any> = {};
    for (const [id, data] of Object.entries(SKELETON)) {
        rooms[Number(id)] = {
            id: Number(id), area: 34, z: 0, x: data.x, y: data.y,
            exits: {...data.exits}, specialExits: {}, customLines: {}, userData: {}, env: -1,
        };
    }
    rooms[CATAFALQUE_ROOM_ID] = {
        id: CATAFALQUE_ROOM_ID, area: 34, z: 0, x: 60, y: 74,
        exits: {}, specialExits: {portal: 26295}, customLines: {}, userData: {dir_bind: 'north=portal'},
    };
    rooms[26295].specialExits = {portal: CATAFALQUE_ROOM_ID};
    rooms[26295].userData = {dir_bind: 'south=portal'};
    rooms[26295].customLines = {portal: {points: [{x: 60, y: -74}], attributes: {}}};
    rooms[26299].customLines = {up: {points: [{x: 64, y: -86}], attributes: {}}};
    rooms[26299].env = 257;
    rooms[TEMPLE_ROOM_ID] = {
        id: TEMPLE_ROOM_ID, area: 34, z: 0, x: 64, y: 86,
        exits: {west: 6226, down: 26299}, specialExits: {}, customLines: {}, userData: {},
    };
    return rooms;
}

class FakeClient {
    Triggers = new Triggers({} as any);
    rooms = buildRooms();
    currentId: number | undefined;
    listeners: Record<string, Function[]> = {};

    Map = {
        currentRoom: undefined as any,
        tryGetMapReader: () => ({rooms: this.rooms}),
        setMapRoomById: (id: number) => {
            this.currentId = id;
            this.Map.currentRoom = this.rooms[id];
            this.emit('enterLocation', {id});
        },
        applyRoomChanges: (changes: any[]) => {
            for (const change of changes) {
                const room = this.rooms[change.roomId];
                if (!room) continue;
                if (change.exits) room.exits = {...change.exits};
                if (change.roomChar !== undefined) room.roomChar = change.roomChar;
                if (change.env !== undefined) room.env = change.env;
                if (change.specialExits) room.specialExits = {...change.specialExits};
                if (change.customLines) room.customLines = {...change.customLines};
                if (change.x !== undefined) room.x = change.x;
                if (change.y !== undefined) room.y = change.y;
                if (change.userData) {
                    for (const [key, value] of Object.entries(change.userData)) {
                        if (value === null) delete room.userData[key];
                        else room.userData[key] = value;
                    }
                }
            }
            return changes.length;
        },
    };

    on = (event: string, listener: Function) => {
        (this.listeners[event] ??= []).push(listener);
        return () => {};
    };
    emit(event: string, detail?: unknown) {
        this.listeners[event]?.forEach(listener => listener(detail));
    }
}

describe('taragorn labyrinth - odcisk lokacji', () => {
    test('wezly rozpoznaja sie jednoznacznie', () => {
        const hubs = [25649, 25650, 25651, 25652, 25653, 25655, 25658, 26296];
        for (const id of hubs) {
            const dirs = Object.keys(SKELETON[id].exits).filter(dir => dir !== 'up');
            const grates = dirs.filter(dir => hubs.includes(SKELETON[id].exits[dir]));
            expect(grates).toHaveLength(2);
            expect(matchTaragornRooms(dirs, grates)).toEqual([id]);
        }
    });

    test('laczniki zwezaja sie do dwoch mozliwosci o rozlacznych sasiadach', () => {
        const corridors = TARAGORN_ROOM_IDS.filter(id => Object.keys(SKELETON[id].exits).filter(d => d !== 'up').length === 2);
        expect(corridors).toHaveLength(8);
        for (const id of corridors) {
            const dirs = Object.keys(SKELETON[id].exits).filter(dir => dir !== 'up');
            const candidates = matchTaragornRooms(dirs, []);
            expect(candidates).toHaveLength(2);
            expect(candidates).toContain(id);

            const [first, second] = candidates.map(candidate => Object.values(SKELETON[candidate].exits));
            expect(first.filter(target => second.includes(target))).toEqual([]);
        }
    });

    test('nieznany odcisk nie pasuje do niczego', () => {
        expect(matchTaragornRooms(['north', 'east', 'west'], [])).toEqual([]);
    });
});

describe('taragorn labyrinth - czytanie opisu', () => {
    test('kraty zamykajace przejscia', () => {
        expect(parseGrateDirections('Ciezka krata zamykajaca przejscie na polnoc i ciezka krata zamykajaca przejscie na wschod.'))
            .toEqual(['north', 'east']);
    });

    test('krata opadajaca liczy sie jak zamknieta', () => {
        expect(parseGrateDirections('Opadajaca ciezka krata ponad przejsciem na polnoc i ciezka krata zamykajaca przejscie na zachod.'))
            .toEqual(['north', 'west']);
    });

    test('drzwi w wierszu nie sa krata', () => {
        const line = 'Ciezka krata zamykajaca przejscie na polnocny-zachod, ciezka krata zamykajaca przejscie na polnocny-wschod i otwarte niewysokie drzwi prowadzace na gore.';
        expect(parseGrateDirections(line)).toEqual(['northwest', 'northeast']);
        expect(parseDoorUp(line)).toBe(true);
    });

    test('wiersz walki nie jest opisem drzwi', () => {
        expect(parseGrateDirections('Wilibald zapiera sie nogami o grunt i probuje uniesc polnocna ciezka krate.')).toEqual([]);
        expect(parseGrateDirections('Polnocna ciezka krata zaczyna powoli opadac.')).toEqual([]);
    });

    test('wyjscia gmcp rozbite na kierunki, gore i wyjscia specjalne', () => {
        const exits = readGmcpExits({info: {exits: ['polnoc', 'poludnie', 'gora', 'portal']}});
        expect(exits.dirs).toEqual(['north', 'south']);
        expect(exits.up).toBe(true);
        expect(exits.specials).toEqual(['portal']);
    });
});

describe('taragorn labyrinth - orientacja w grze', () => {
    let client: FakeClient;
    let parse: (line: string) => void;

    // MapHelper moves currentRoom first and only then announces enterLocation.
    const mapMoveTo = (id: number) => {
        client.Map.currentRoom = client.rooms[id];
        client.emit('enterLocation', {id});
    };

    const enterRoom = (mapMovesTo: number, doorLine: string | null, exits: string[]) => {
        setGmcp('room.info', {exits});
        mapMoveTo(mapMovesTo);
        if (doorLine) parse(doorLine);
        client.emit('gmcp_msg.room.exits');
    };

    beforeEach(() => {
        setGmcp('room.info', undefined);
        client = new FakeClient();
        initTaragornLabyrinth(client as any);
        parse = (line: string) => {
            Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
        };
    });

    test('wezel rozpoznaje sie od razu i przepina schody', () => {
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        // Map still believes the stairs land in 26299; they really land in 25655.
        enterRoom(26299,
            'Ciezka krata zamykajaca przejscie na polnocny-zachod, ciezka krata zamykajaca przejscie na polnocny-wschod i otwarte niewysokie drzwi prowadzace na gore.',
            ['polnoc', 'poludnie', 'gora']);

        expect(client.currentId).toBe(25655);
        expect(client.rooms[25655].exits.up).toBe(TEMPLE_ROOM_ID);
        expect(client.rooms[26299].exits.up).toBeUndefined();
        expect(client.rooms[TEMPLE_ROOM_ID].exits.down).toBe(25655);
        // No line across half the map - the entrance wears the temple's colour
        // and the up/down arrows say the rest.
        expect(client.rooms[26299].customLines.up).toBeUndefined();
        expect(client.rooms[25655].customLines.up).toBeUndefined();
        expect(client.rooms[25655].env).toBe(270);
        expect(client.rooms[26299].env).toBe(257);
    });

    test('lacznik czeka na jeden krok, potem wskazuje obie lokacje', () => {
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        enterRoom(26299, null, ['poludniowy-wschod', 'polnocny-zachod', 'gora']);

        // Ambiguous, so the map is left where the stale stairs put it.
        expect(client.currentId).toBeUndefined();

        // One step into a hub settles it: 25653 only borders 25657.
        enterRoom(25650,
            'Ciezka krata zamykajaca przejscie na wschod i ciezka krata zamykajaca przejscie na poludnie.',
            ['poludniowy-wschod', 'polnocny-zachod']);

        expect(client.currentId).toBe(25653);
        expect(client.rooms[25657].exits.up).toBe(TEMPLE_ROOM_ID);
        expect(client.rooms[TEMPLE_ROOM_ID].exits.down).toBe(25657);
    });

    test('lacznik zgodny z pozycja mapy przy wejsciu i tak wymaga kroku', () => {
        // The stale map lands on 26299, which shares its fingerprint with 25659 -
        // a coincidence, not a confirmation.
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        enterRoom(26299, null, ['wschod', 'zachod', 'gora']);
        expect(client.currentId).toBeUndefined();

        // Stepping into 25653 can only have come from 25659.
        enterRoom(25650,
            'Ciezka krata zamykajaca przejscie na wschod i ciezka krata zamykajaca przejscie na poludnie.',
            ['poludniowy-wschod', 'polnocny-zachod']);
        expect(client.currentId).toBe(25653);
        expect(client.rooms[25659].exits.up).toBe(TEMPLE_ROOM_ID);
        expect(client.rooms[26299].exits.up).toBeUndefined();
    });

    test('wejscie zdejmuje portal zapamietany z poprzedniej wizyty', () => {
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        enterRoom(26299,
            'Ciezka krata zamykajaca przejscie na polnocny-zachod, ciezka krata zamykajaca przejscie na polnocny-wschod i otwarte niewysokie drzwi prowadzace na gore.',
            ['polnoc', 'poludnie', 'gora']);

        expect(client.rooms[26295].specialExits.portal).toBeUndefined();
        expect(client.rooms[26295].userData.dir_bind).toBeUndefined();
        expect(client.rooms[CATAFALQUE_ROOM_ID].specialExits.portal).toBeUndefined();
        expect(client.rooms[CATAFALQUE_ROOM_ID].userData.dir_bind).toBeUndefined();

        // Second room in the same visit: nothing left to clear, no repeat message.
        enterRoom(25654, null, ['polnocny-wschod', 'poludniowy-zachod']);
        expect(client.rooms[CATAFALQUE_ROOM_ID].userData.dir_bind).toBeUndefined();
    });

    test('sala z portalem rozpoznaje sie po nazwie, zanim portal da sie otworzyc', () => {
        // First visit: the portal is not open yet, so it is not among the exits -
        // only the room name gives it away.
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        setGmcp('room.info', {exits: ['poludniowy-wschod', 'polnocny-zachod']});
        mapMoveTo(26299);
        client.emit('gmcp_msg.room.short', {text: 'Sala z portalem.'});
        parse('Ciezka krata zamykajaca przejscie na wschod i ciezka krata zamykajaca przejscie na poludnie.');
        client.emit('gmcp_msg.room.exits');

        expect(client.currentId).toBe(25653);
        expect(client.rooms[25653].roomChar).toBe('P');
        expect(client.rooms[25653].specialExits.portal).toBe(CATAFALQUE_ROOM_ID);
        expect(client.rooms[CATAFALQUE_ROOM_ID].specialExits.portal).toBe(25653);
    });

    test('kolor wejscia przenosi sie przy nastepnej wizycie', () => {
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        enterRoom(26299,
            'Ciezka krata zamykajaca przejscie na polnocny-zachod, ciezka krata zamykajaca przejscie na polnocny-wschod i otwarte niewysokie drzwi prowadzace na gore.',
            ['polnoc', 'poludnie', 'gora']);
        expect(client.rooms[25655].env).toBe(270);

        // Out of the labyrinth, then back down - this reset the stairs land elsewhere.
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        client.emit('enterLocation', {id: TEMPLE_ROOM_ID});
        enterRoom(25655,
            'Ciezka krata zamykajaca przejscie na wschod, ciezka krata zamykajaca przejscie na poludnie i otwarte niewysokie drzwi prowadzace na gore.',
            ['poludniowy-wschod', 'polnocny-zachod', 'gora']);

        expect(client.currentId).toBe(25653);
        expect(client.rooms[25653].env).toBe(270);
        expect(client.rooms[25653].exits.up).toBe(TEMPLE_ROOM_ID);
        expect(client.rooms[25655].env).toBe(-1);
        expect(client.rooms[25655].exits.up).toBeUndefined();
    });

    test('sala z portalem w laczniku, na ktorym mapa juz stoi', () => {
        // Walk in, get located in a hub, then step into the portal corridor the
        // map already tracks correctly. Position needs no fixing - the portal does.
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        enterRoom(26299,
            'Ciezka krata zamykajaca przejscie na wschod i ciezka krata zamykajaca przejscie na poludnie.',
            ['poludniowy-wschod', 'polnocny-zachod']);
        expect(client.currentId).toBe(25653);

        setGmcp('room.info', {exits: ['poludniowy-wschod', 'polnocny-zachod']});
        mapMoveTo(25657);
        client.emit('gmcp_msg.room.short', {text: 'Sala z portalem.'});
        client.emit('gmcp_msg.room.exits');

        expect(client.rooms[25657].roomChar).toBe('P');
        expect(client.rooms[25657].specialExits.portal).toBe(CATAFALQUE_ROOM_ID);
        expect(client.rooms[CATAFALQUE_ROOM_ID].specialExits.portal).toBe(25657);
        expect(client.rooms[25657].customLines.portal).toBeDefined();
    });

    test('zwykla sala nie przejmuje portalu', () => {
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        setGmcp('room.info', {exits: ['poludniowy-wschod', 'polnocny-zachod']});
        mapMoveTo(26299);
        client.emit('gmcp_msg.room.short', {text: 'Pobielona sala z lancuchami.'});
        parse('Ciezka krata zamykajaca przejscie na wschod i ciezka krata zamykajaca przejscie na poludnie.');
        client.emit('gmcp_msg.room.exits');

        expect(client.currentId).toBe(25653);
        expect(client.rooms[25653].roomChar).toBeUndefined();
        expect(client.rooms[25653].specialExits.portal).toBeUndefined();
    });

    test('portal przenosi sie razem z komnata katafalku', () => {
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        enterRoom(26299,
            'Ciezka krata zamykajaca przejscie na wschod i ciezka krata zamykajaca przejscie na poludnie.',
            ['poludniowy-wschod', 'polnocny-zachod', 'portal']);

        expect(client.currentId).toBe(25653);
        expect(client.rooms[25653].specialExits.portal).toBe(CATAFALQUE_ROOM_ID);
        expect(client.rooms[CATAFALQUE_ROOM_ID].specialExits.portal).toBe(25653);
        expect(client.rooms[26295].specialExits.portal).toBeUndefined();
        expect(client.rooms[26295].customLines.portal).toBeUndefined();
        expect(client.rooms[25653].roomChar).toBe('P');
        // The catafalque moved to a free cell next to its new portal room.
        const moved = client.rooms[CATAFALQUE_ROOM_ID];
        expect(Math.abs(moved.x - 56)).toBeLessThanOrEqual(2);
        expect(Math.abs(moved.y - 74)).toBeLessThanOrEqual(2);
        expect(Object.values(client.rooms).filter(room =>
            room.id !== CATAFALQUE_ROOM_ID && room.x === moved.x && room.y === moved.y)).toEqual([]);
        expect(moved.userData.dir_bind).toMatch(/=portal$/);
        expect(client.rooms[25653].customLines.portal.points).toEqual([{x: moved.x, y: -moved.y}]);
    });

    test('opis bez odcisku labiryntu nic nie zmienia', () => {
        client.Map.currentRoom = client.rooms[25653];
        client.currentId = undefined;
        enterRoom(25653, null, ['polnoc', 'wschod', 'zachod']);
        expect(client.currentId).toBeUndefined();
        expect(client.rooms[25653].env).toBe(-1);
    });

    test('wznowienie sesji w labiryncie startuje bez enterLocation', () => {
        // On reconnect the map restores its position silently, so the only
        // signal we get is the exits of the next room description.
        client.Map.currentRoom = client.rooms[26299];
        setGmcp('room.info', {exits: ['polnoc', 'poludnie']});
        parse('Ciezka krata zamykajaca przejscie na poludniowy-wschod i ciezka krata zamykajaca przejscie na poludniowy-zachod.');
        client.emit('gmcp_msg.room.exits');

        expect(client.currentId).toBe(26296);
    });

    test('poza labiryntem opisy sa ignorowane', () => {
        client.Map.currentRoom = client.rooms[TEMPLE_ROOM_ID];
        client.emit('enterLocation', {id: TEMPLE_ROOM_ID});
        setGmcp('room.info', {exits: ['polnoc', 'poludnie', 'gora']});
        parse('Ciezka krata zamykajaca przejscie na polnocny-zachod i ciezka krata zamykajaca przejscie na polnocny-wschod.');
        client.emit('gmcp_msg.room.exits');
        expect(client.currentId).toBeUndefined();
    });
});

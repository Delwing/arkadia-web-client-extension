import initBagno from '@client/scripts/bagno';
import Triggers from '@client/Triggers';
import {AnsiAwareBuffer} from '@client/ansi/FormatState';
import {buildRooms, FakeMap} from '../helpers/fakeMap';

const SLAB = 24299;
const SWAMP = 24310;
const OTHER_SWAMP = 24311;
const ELSEWHERE = 11111;
const VARIENO = 44;

class FakeClient {
    Triggers = new Triggers({} as any);
    rooms = {
        ...buildRooms([SLAB, SWAMP, OTHER_SWAMP], VARIENO),
        ...buildRooms([ELSEWHERE], 27),
    };
    Map = new FakeMap(this.rooms);
    inTeam = false;
    leader = false;

    TeamManager = {
        isInAnyTeam: () => this.inTeam,
        isLeader: () => this.leader,
    };

    on = () => () => {
    };

    enter(id: number) {
        this.Map.enter(id);
    }

    reveal() {
        this.Triggers.parseLine(new AnsiAwareBuffer('Bagno odslonilo tu fragment kamiennej plyty.'), 'text');
    }
}

function setup() {
    const client = new FakeClient();
    initBagno(client as any);
    return client;
}

describe('bagno - kamienna plyta', () => {
    test('odslonieta plyta laczy biezace bagno z lokacja pod nim', () => {
        const client = setup();
        client.enter(SWAMP);
        client.reveal();

        expect(client.rooms[SWAMP].exits.down).toBe(SLAB);
        expect(client.rooms[SLAB].exits.up).toBe(SWAMP);
    });

    test('kolejna plyta przenosi polaczenie', () => {
        const client = setup();
        client.enter(SWAMP);
        client.reveal();
        client.enter(OTHER_SWAMP);
        client.reveal();

        expect(client.rooms[SWAMP].exits.down).toBeUndefined();
        expect(client.rooms[OTHER_SWAMP].exits.down).toBe(SLAB);
        expect(client.rooms[SLAB].exits.up).toBe(OTHER_SWAMP);
    });

    test('bez komend nie dokladamy specjalnych wyjsc ani dir_bindow', () => {
        const client = setup();
        client.enter(SWAMP);
        client.reveal();

        expect(client.rooms[SWAMP].specialExits).toEqual({});
        expect(client.rooms[SWAMP].userData.dir_bind).toBeUndefined();
    });

    test('ta sama linia poza Varieno niczego nie laczy', () => {
        const client = setup();
        client.enter(ELSEWHERE);
        client.reveal();

        expect(client.rooms[ELSEWHERE].exits.down).toBeUndefined();
        expect(client.rooms[SLAB].exits.up).toBeUndefined();
        expect(client.Map.refreshedAreas).toEqual([]);
    });

    test('prowadzacy druzyne dostaje polaczenie', () => {
        const client = setup();
        client.inTeam = true;
        client.leader = true;
        client.enter(SWAMP);
        client.reveal();

        expect(client.rooms[SWAMP].exits.down).toBe(SLAB);
    });

    test('idacy w druzynie za kims innym - bez zmian na mapie', () => {
        const client = setup();
        client.inTeam = true;
        client.leader = false;
        client.enter(SWAMP);
        client.reveal();

        expect(client.rooms[SWAMP].exits.down).toBeUndefined();
        expect(client.rooms[SLAB].exits.up).toBeUndefined();
        expect(client.Map.refreshedAreas).toEqual([]);
    });
});

import initOpal from '@client/scripts/opal';
import Triggers from '@client/Triggers';
import {AnsiAwareBuffer} from '@client/ansi/FormatState';
import {buildRooms, FakeMap} from '../helpers/fakeMap';

const HOLE = 17253;
const ENTRANCES = [17238, 17232, 24459, 17247, 17227];

class FakeClient {
    Triggers = new Triggers({} as any);
    rooms = buildRooms([...ENTRANCES, HOLE]);
    Map = Object.assign(new FakeMap(this.rooms), {locationHistory: [] as number[]});
    listeners: Record<string, Function[]> = {};

    on = (event: string, listener: Function) => {
        (this.listeners[event] ??= []).push(listener);
        return () => {
        };
    };

    emit(event: string, detail?: unknown) {
        this.listeners[event]?.forEach(listener => listener(detail));
    }

    enter(id: number) {
        this.Map.enter(id);
    }

    line(text: string) {
        this.Triggers.parseLine(new AnsiAwareBuffer(text), 'text');
    }
}

function setup() {
    const client = new FakeClient();
    initOpal(client as any);
    return client;
}

describe('opal - dziura w podlodze jaskini', () => {
    test('znalezienie dziury laczy biezaca jaskinie z pieczara', () => {
        const client = setup();
        client.enter(17232);
        client.line('W szczelinie miedzy dwiema skalnymi plytami podlogi odnajdujesz niewielki otwor.');

        expect(client.rooms[17232].exits.down).toBe(HOLE);
        expect(client.rooms[HOLE].exits.up).toBe(17232);
    });

    test('znalezienie przez kogos innego dziala tak samo', () => {
        const client = setup();
        client.enter(24459);
        client.line('Zgredek odnajduje cos w podlodze jaskini.');

        expect(client.rooms[24459].exits.down).toBe(HOLE);
        expect(client.rooms[HOLE].exits.up).toBe(24459);
    });

    test('nowe polaczenie zrywa stare na pozostalych wejsciach', () => {
        const client = setup();
        client.enter(17232);
        client.line('Zgredek odnajduje cos w podlodze jaskini.');
        client.enter(17247);
        client.line('Zgredek odnajduje cos w podlodze jaskini.');

        expect(client.rooms[17232].exits.down).toBeUndefined();
        expect(client.rooms[17247].exits.down).toBe(HOLE);
        expect(client.rooms[HOLE].exits.up).toBe(17247);
    });

    test('polaczenia spoza mapy opalu zostaja nietkniete', () => {
        const client = setup();
        client.rooms[17232].exits.down = 999;
        client.enter(17247);
        client.line('Zgredek odnajduje cos w podlodze jaskini.');

        expect(client.rooms[17232].exits.down).toBe(999);
    });

    test('zejscie do pieczary laczy pokoj, z ktorego przyszlismy', () => {
        const client = setup();
        client.Map.locationHistory = [17227, HOLE];
        client.enter(HOLE);
        client.emit('enterLocation', {id: HOLE, direction: 'down'});

        expect(client.rooms[17227].exits.down).toBe(HOLE);
        expect(client.rooms[HOLE].exits.up).toBe(17227);
    });

    test('wejscie do pieczary z innej strony niczego nie laczy', () => {
        const client = setup();
        client.Map.locationHistory = [17227, HOLE];
        client.enter(HOLE);
        client.emit('enterLocation', {id: HOLE, direction: 'north'});

        expect(client.rooms[17227].exits.down).toBeUndefined();
        expect(client.rooms[HOLE].exits.up).toBeUndefined();
    });

    test('mapa dostaje sygnal do odswiezenia obszaru', () => {
        const client = setup();
        client.enter(17232);
        client.line('Zgredek odnajduje cos w podlodze jaskini.');

        expect(client.Map.refreshedAreas).toEqual([[1]]);
    });
});

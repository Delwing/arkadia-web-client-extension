import initWrak from '@client/scripts/wrak';
import Triggers from '@client/Triggers';
import {AnsiAwareBuffer} from '@client/ansi/FormatState';
import {buildRooms, FakeMap} from '../helpers/fakeMap';

const CABIN = 25613;
const SEABED = 25600;
const OTHER_SEABED = 25601;
const ELSEWHERE = 11111;
const BACCALA = 42;

class FakeClient {
    Triggers = new Triggers({} as any);
    rooms = {
        ...buildRooms([CABIN, SEABED, OTHER_SEABED], BACCALA),
        ...buildRooms([ELSEWHERE], 27),
    };
    Map = new FakeMap(this.rooms);

    on = () => () => {
    };

    enter(id: number) {
        this.Map.enter(id);
    }

    line(text: string) {
        this.Triggers.parseLine(new AnsiAwareBuffer(text), 'text');
    }

    see() {
        this.line('[Rozbity zamulony wrak brygu].');
    }
}

function setup() {
    const client = new FakeClient();
    initWrak(client as any);
    return client;
}

describe('wrak brygu - kabina', () => {
    test('wrak laczy sie z kabina w gore i w dol', () => {
        const client = setup();
        client.enter(SEABED);
        client.see();

        expect(client.rooms[SEABED].exits.down).toBe(CABIN);
        expect(client.rooms[CABIN].exits.up).toBe(SEABED);
    });

    test('komendy trafiaja i w specjalne wyjscia, i w dir_bind', () => {
        const client = setup();
        client.enter(SEABED);
        client.see();

        expect(client.rooms[SEABED].specialExits['wplyn do kabiny']).toBe(CABIN);
        expect(client.rooms[SEABED].userData.dir_bind).toBe('down=wplyn do kabiny');
        expect(client.rooms[CABIN].specialExits['wyplyn z kabiny']).toBe(SEABED);
        expect(client.rooms[CABIN].userData.dir_bind).toBe('up=wyplyn z kabiny');
    });

    test('istniejace dir_bindy w innych kierunkach zostaja', () => {
        const client = setup();
        client.rooms[SEABED].userData.dir_bind = 'north=przejdz przez luk';
        client.enter(SEABED);
        client.see();

        expect(client.rooms[SEABED].userData.dir_bind).toBe('north=przejdz przez luk&down=wplyn do kabiny');
    });

    test('przeniesiony wrak zabiera ze soba komendy i wyjscia', () => {
        const client = setup();
        client.enter(SEABED);
        client.see();
        client.enter(OTHER_SEABED);
        client.see();

        expect(client.rooms[SEABED].exits.down).toBeUndefined();
        expect(client.rooms[SEABED].specialExits['wplyn do kabiny']).toBeUndefined();
        expect(client.rooms[SEABED].userData.dir_bind).toBeUndefined();
        expect(client.rooms[OTHER_SEABED].exits.down).toBe(CABIN);
        expect(client.rooms[OTHER_SEABED].userData.dir_bind).toBe('down=wplyn do kabiny');
        expect(client.rooms[CABIN].exits.up).toBe(OTHER_SEABED);
        expect(client.rooms[CABIN].specialExits['wyplyn z kabiny']).toBe(OTHER_SEABED);
    });

    test('linia bez nawiasow i bez kropki tez laczy', () => {
        const client = setup();
        client.enter(SEABED);
        client.line('Rozbity zamulony wrak brygu');

        expect(client.rooms[SEABED].exits.down).toBe(CABIN);
    });

    test('wzmianka w zdaniu niczego nie przenosi', () => {
        const client = setup();
        client.enter(SEABED);
        client.see();
        client.enter(OTHER_SEABED);
        client.line('Rozbity zamulony wrak brygu spoczywa gdzies w poblizu.');

        expect(client.rooms[SEABED].exits.down).toBe(CABIN);
        expect(client.rooms[OTHER_SEABED].exits.down).toBeUndefined();
    });

    test('mapa dostaje sygnal do odswiezenia obszaru', () => {
        const client = setup();
        client.enter(SEABED);
        client.see();

        expect(client.Map.refreshedAreas).toEqual([[BACCALA]]);
        expect(client.Map.silentRenders).toEqual([SEABED]);
    });

    test('ta sama linia poza Baccala niczego nie laczy', () => {
        const client = setup();
        client.enter(ELSEWHERE);
        client.see();

        expect(client.rooms[ELSEWHERE].exits.down).toBeUndefined();
        expect(client.rooms[CABIN].exits.up).toBeUndefined();
        expect(client.Map.refreshedAreas).toEqual([]);
    });

    test('powtorzona linia nie przerysowuje mapy drugi raz', () => {
        const client = setup();
        client.enter(SEABED);
        client.see();
        client.see();

        expect(client.Map.refreshedAreas).toHaveLength(1);
    });
});

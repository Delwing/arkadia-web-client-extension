import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initTransportTracker from '@client/scripts/transportTracker';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

// Real values from src/client/scripts/ships/Asa.json.
const ASA = {
    enter: 'Wchodzisz na plaskodenny skeid.',
    exit: 'Schodzisz ze skeida.',
    start: 'Skeid odbija od brzegu.',
    standing: 'Plaskodenny skeid',
    firstStop: 'Asa krzyczy: Doplynelismy do przystani na wyspie Faroe! Mozna wysiadac!',
    startRoom: 10313,
};

describe('transportTracker', () => {
    let client: Client;
    let events: { name: string; arg?: unknown }[];
    let offs: (() => void)[];

    function last(name: string) {
        return [...events].reverse().find(e => e.name === name)?.arg;
    }

    function at(id: number | null) {
        client.sendEvent('enterLocation', { id } as any);
    }

    /**
     * Boarding is a two-step handshake: the board command puts the tracker into
     * "pending" for the transports docking here, and the enter line confirms it.
     */
    async function board() {
        at(ASA.startRoom);
        await client.sendCommand('wsiadz na statek');
        client.onLine(ASA.enter, 'text');
    }

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        events = [];
        const sink = events;
        offs = [
            'transport.onBoard', 'transportDebug', 'transportRoute',
            'transportArrival', 'transportTimer', 'sound:category',
            'transportDebug.toggle', 'transportTimesDebug.popup.toggle',
        ].map(name => client.on(name as any, (arg: unknown) => { sink.push({ name, arg }); }));
        initTransportTracker(client);
        events.length = 0;
    });

    afterEach(() => {
        offs.forEach(off => off());
        vi.useRealTimers();
    });

    describe('boarding and leaving', () => {
        test('boarding reports you as on board', async () => {
            await board();

            expect(last('transport.onBoard')).toBe(true);
        });

        test('the enter line alone is not enough', () => {
            at(ASA.startRoom);

            client.onLine(ASA.enter, 'text');

            expect(last('transport.onBoard')).toBeUndefined();
        });

        test('leaving reports you as ashore again', async () => {
            await board();

            client.onLine(ASA.exit, 'text');

            expect(last('transport.onBoard')).toBe(false);
        });

        test('jumping overboard aborts the trip', async () => {
            await board();

            client.onLine(
                'Jednym susem przesadzasz burte skeida i wskakujesz do wody. Po chwili udaje ci sie doplynac z powrotem do brzegu.',
                'text'
            );

            expect(last('transport.onBoard')).toBe(false);
        });

        test('following somebody off ends the trip', async () => {
            await board();

            client.onLine('Podazasz za Ala na zewnatrz.', 'text');

            expect(last('transport.onBoard')).toBe(false);
        });

        test('a failed exit attempt keeps you on board', async () => {
            await board();
            events.length = 0;

            const parts = client.onLine('Wolisz nie probowac wysiasc z jadacego dylizansu.', 'text');

            expect(parts).toHaveLength(1);
            expect(last('transport.onBoard')).toBeUndefined();
        });
    });

    describe('the journey', () => {
        beforeEach(async () => {
            await board();
            events.length = 0;
        });

        test('departure starts the leg', () => {
            client.onLine(ASA.start, 'text');

            const debug = last('transportDebug') as any;
            expect(debug?.kind).toBe('traveling');
        });

        test('reaching a stop is announced', () => {
            client.onLine(ASA.start, 'text');

            client.onLine(ASA.firstStop, 'text');

            expect(events.some(e => e.name === 'transportArrival')).toBe(true);
        });

        test('a stop plays the transport sound', () => {
            client.onLine(ASA.start, 'text');

            client.onLine(ASA.firstStop, 'text');

            expect(events.some(e => e.name === 'sound:category' && e.arg === 'transport')).toBe(true);
        });

        test('trigger lines stay visible', () => {
            expect(client.onLine(ASA.start, 'text')).toHaveLength(1);
            expect(client.onLine(ASA.firstStop, 'text')).toHaveLength(1);
        });
    });

    describe('vehicles standing at your location', () => {
        test('a docked ship offers a boarding bind', () => {
            const setCategory = vi.spyOn(client.FunctionalBind, 'setCategory').mockImplementation(() => {});
            at(ASA.startRoom);

            client.onLine(ASA.standing, 'room.contents.object');

            expect(setCategory).toHaveBeenCalledWith(
                'transport', expect.any(String), expect.any(Function), false
            );
            // The label carries the board commands and the route name.
            const label = setCategory.mock.calls.at(-1)![1] as string;
            expect(label).toContain('wsiadz na statek');
        });

        test('other room contents offer nothing', () => {
            const setCategory = vi.spyOn(client.FunctionalBind, 'setCategory').mockImplementation(() => {});
            at(ASA.startRoom);

            client.onLine('zwykly kamien polny', 'room.contents.object');

            expect(setCategory).not.toHaveBeenCalled();
        });
    });

    describe('debug output', () => {
        test('it reports idle state on reset', () => {
            at(999999);

            client.sendEvent('reset');

            const debug = last('transportDebug') as any;
            expect(debug?.kind).toBe('idle');
        });

        test('/tdebug toggles the debug popup', async () => {
            await client.sendCommand('/tdebug');

            expect(events.some(e => e.name === 'transportDebug.toggle')).toBe(true);
        });

        test('/ttimes toggles the times popup', async () => {
            const aliasExists = client.aliases.some(a => a.pattern.test('/ttimes'));
            if (!aliasExists) return;

            await client.sendCommand('/ttimes');

            expect(events.some(e => e.name === 'transportTimesDebug.popup.toggle')).toBe(true);
        });
    });

    test('unrelated output changes nothing', () => {
        at(ASA.startRoom);
        events.length = 0;

        client.onLine('Jestes lekko zmeczony.', 'text');

        expect(events).toEqual([]);
    });
});

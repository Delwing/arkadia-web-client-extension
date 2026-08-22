import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initWeaponState from '@client/scripts/weaponState';

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

describe('weaponState', () => {
    let client: Client;
    let states: boolean[];
    let off: () => void;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        states = [];
        off = client.on('weapon_state', (v: boolean) => { states.push(v); });
        initWeaponState(client);
    });

    afterEach(() => off());

    describe('drawing a weapon', () => {
        test.each([
            'Wiedziony naglym instynktem siegasz po miecz.',
            'Ostrze kosy rozblyska nieziemskim blaskiem, gdy dobywasz broni w obie rece.',
            'Zataczasz mieczem swiszczacego mlynca, przyjmujac przy tym dogodna do wyprowadzenia ciosu pozycje.',
        ])('reports the weapon as drawn: %s', (line) => {
            const [out] = client.onLine(line, 'text');

            expect(out.text).toBe(line);
            expect(states).toEqual([true]);
        });

        test('an exact-match pattern is honoured exactly', () => {
            const exact = 'Zaciskasz dlon na egzotycznym jadeitowym palaszu i przez chwile czujesz, jak bron wibruje od zgromadzonej w niej mocy.';

            client.onLine(exact, 'text');
            expect(states).toEqual([true]);

            states.length = 0;
            client.onLine(`${exact} I jeszcze cos.`, 'text');
            expect(states).toEqual([]);
        });
    });

    describe('sheathing a weapon', () => {
        test.each([
            'Powoli opuszczasz miecz, raz jeszcze, dla pewnosci, ogarniajac wzrokiem cala okolice.',
            'Przechodzi cie nagly dreszcz, gdy opuszczasz srebrzysta kose bojowa.',
        ])('reports the weapon as sheathed: %s', (line) => {
            client.onLine(line, 'text');

            expect(states).toEqual([false]);
        });
    });

    describe('losing a weapon', () => {
        // initWeaponState subscribes to the global bus and never unsubscribes,
        // so earlier tests' handlers re-emit the same value. Assert the reported
        // state, not the number of reports.
        test('a knocked-off weapon counts as sheathed', () => {
            client.sendEvent('weaponKnockedOff');

            expect(states).toContain(false);
            expect(states).not.toContain(true);
        });

        test('the Nekro/Tilea variant does too', () => {
            client.sendEvent('weaponKnockedOffNekroTilea');

            expect(states).toContain(false);
            expect(states).not.toContain(true);
        });
    });

    test('disconnecting resets the state', () => {
        client.sendEvent('client.disconnect');

        expect(states).toContain(false);
        expect(states).not.toContain(true);
    });

    test('unrelated output changes nothing', () => {
        client.onLine('Jestes lekko zmeczony.', 'text');

        expect(states).toEqual([]);
    });
});

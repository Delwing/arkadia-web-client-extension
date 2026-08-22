import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initOrderTimer from '@client/scripts/orderTimer';

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

describe('orderTimer', () => {
    let client: Client;
    let ticks: (number | null)[];
    let off: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        ticks = [];
        off = client.on('orderTimer', (v: number | null) => { ticks.push(v); });
        client.TeamManager.isLeader = () => true;
        initOrderTimer(client);
    });

    afterEach(() => {
        off();
        vi.useRealTimers();
    });

    test.each([
        'Wydajesz rozkaz do ataku.',
        'Glosno wypowiadasz rozkaz, chyba jednak nikt cie nie zrozumial.',
        'Ala przekazuje ci prowadzenie druzyny.',
    ])('starts the 15s cooldown after: %s', (line) => {
        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(line);
        expect(ticks[0]).toBeCloseTo(15, 0);
    });

    test('it ticks down and then clears', () => {
        client.onLine('Wydajesz rozkaz do ataku.', 'text');
        ticks.length = 0;

        vi.advanceTimersByTime(1000);
        expect(ticks.at(-1)).toBeLessThan(15);

        vi.advanceTimersByTime(15_000);
        expect(ticks.at(-1)).toBeNull();
    });

    test('nothing happens when you are not the leader', () => {
        client.TeamManager.isLeader = () => false;

        client.onLine('Wydajesz rozkaz do ataku.', 'text');

        expect(ticks).toEqual([]);
    });

    test('a new order restarts the cooldown', () => {
        client.onLine('Wydajesz rozkaz do ataku.', 'text');
        vi.advanceTimersByTime(5000);
        ticks.length = 0;

        client.onLine('Wydajesz rozkaz do odwrotu.', 'text');

        expect(ticks[0]).toBeCloseTo(15, 0);
    });

    test('unrelated output starts nothing', () => {
        client.onLine('Jestes lekko zmeczony.', 'text');

        expect(ticks).toEqual([]);
    });
});

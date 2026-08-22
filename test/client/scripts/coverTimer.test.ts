import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initCoverTimer from '@client/scripts/coverTimer';

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

describe('coverTimer', () => {
    let client: Client;
    let ticks: (number | null)[];
    let off: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        ticks = [];
        off = client.on('coverTimer', (v: number | null) => { ticks.push(v); });
        initCoverTimer(client);
    });

    afterEach(() => {
        off();
        vi.useRealTimers();
    });

    test.each([
        'Zrecznie zaslaniasz Ale przed ciosami goblina.',
        'Z wprawa stajesz pomiedzy Ala a goblinem, przyjmujac na siebie nadchodzace ciosy.',
        'Stajesz u boku Ali, gotow w kazdej chwili zaslonic ja przed nadchodzacym niebezpieczenstwem.',
    ])('a successful cover starts the 5s cooldown: %s', (line) => {
        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(line);
        expect(ticks[0]).toBeCloseTo(5, 0);
    });

    test.each([
        'Probujesz zaslonic Ale przed ciosami goblina, jednak nie jestes w stanie tego uczynic.',
        'Na rozkaz Beli probujesz zaslonic Ale przed ciosami goblina, jednak nie jestes w stanie tego uczynic.',
    ])('a failed cover also starts the cooldown: %s', (line) => {
        client.onLine(line, 'text');

        expect(ticks[0]).toBeCloseTo(5, 0);
    });

    test('an attempted manoeuvre starts it too', () => {
        client.sendEvent('maneuverAttempted');

        expect(ticks[0]).toBeCloseTo(5, 0);
    });

    test('it ticks down and then clears', () => {
        client.onLine('Zrecznie zaslaniasz Ale przed ciosami goblina.', 'text');
        ticks.length = 0;

        vi.advanceTimersByTime(1000);
        expect(ticks.at(-1)).toBeLessThan(5);

        vi.advanceTimersByTime(5000);
        expect(ticks.at(-1)).toBeNull();
    });

    test('a new cover restarts the cooldown', () => {
        client.onLine('Zrecznie zaslaniasz Ale przed ciosami goblina.', 'text');
        vi.advanceTimersByTime(2000);
        ticks.length = 0;

        client.onLine('Zrecznie zaslaniasz Bele przed ciosami goblina.', 'text');

        expect(ticks[0]).toBeCloseTo(5, 0);
    });

    test('unrelated output starts nothing', () => {
        client.onLine('Jestes lekko zmeczony.', 'text');

        expect(ticks).toEqual([]);
    });
});

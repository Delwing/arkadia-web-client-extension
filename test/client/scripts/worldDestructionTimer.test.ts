import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initWorldDestructionTimer from '@client/scripts/worldDestructionTimer';

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

describe('worldDestructionTimer', () => {
    let client: Client;
    let ticks: (number | null)[];
    let off: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        ticks = [];
        off = client.on('worldDestructionTimer', (v: number | null) => { ticks.push(v); });
        initWorldDestructionTimer(client);
    });

    afterEach(() => {
        off();
        vi.useRealTimers();
    });

    test('starts a countdown from the announced minutes', () => {
        const [out] = client.onLine('Pamietaj, juz tylko 2 minut do momentu zniszczenia swiata.', 'text');

        expect(out.text).toBe('Pamietaj, juz tylko 2 minut do momentu zniszczenia swiata.');
        expect(ticks[0]).toBeCloseTo(120, 0);
    });

    test('it ticks down', () => {
        client.onLine('Pamietaj, juz tylko 2 minut do momentu zniszczenia swiata.', 'text');
        ticks.length = 0;

        vi.advanceTimersByTime(1000);

        expect(ticks.at(-1)).toBeLessThan(120);
        expect(ticks.at(-1)).toBeGreaterThan(118);
    });

    test('it clears itself when it runs out', () => {
        client.onLine('Pamietaj, juz tylko 1 minut do momentu zniszczenia swiata.', 'text');

        vi.advanceTimersByTime(61_000);

        expect(ticks.at(-1)).toBeNull();
    });

    test('the announcement is recognised inside a longer line', () => {
        client.onLine(
            'W swoim umysle slyszysz glos Jezdzca Apokalipsy: Pamietaj, juz tylko 5 minut do momentu zniszczenia swiata.',
            'text'
        );

        expect(ticks[0]).toBeCloseTo(300, 0);
    });

    test('a fresh announcement restarts the countdown', () => {
        client.onLine('Pamietaj, juz tylko 5 minut do momentu zniszczenia swiata.', 'text');
        vi.advanceTimersByTime(1000);
        ticks.length = 0;

        client.onLine('Pamietaj, juz tylko 2 minut do momentu zniszczenia swiata.', 'text');

        expect(ticks[0]).toBeCloseTo(120, 0);
    });

    test('disconnecting stops the countdown', () => {
        client.onLine('Pamietaj, juz tylko 5 minut do momentu zniszczenia swiata.', 'text');
        ticks.length = 0;

        client.sendEvent('client.disconnect');

        expect(ticks.at(-1)).toBeNull();
    });

    test('unrelated output starts nothing', () => {
        client.onLine('Jestes lekko zmeczony.', 'text');

        expect(ticks).toEqual([]);
    });
});

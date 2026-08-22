import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initStoneValue from '@client/scripts/stoneValue';

function createClient(printed: string[]): Client {
    return new Client({
        send: () => {},
        output: (out?: string | AnsiAwareBuffer) => {
            printed.push(typeof out === 'string' ? out : (out?.text ?? ''));
        },
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

describe('stoneValue', () => {
    let client: Client;
    let printed: string[];
    let commands: string[];
    let off: () => void;

    function output() {
        client.sendEvent('output-sent', 1);
        return printed.join('');
    }

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        commands = [];
        client = createClient(printed);
        off = client.on('command', (c: string) => { commands.push(c); });
        initStoneValue(client, client.aliases);
    });

    afterEach(() => {
        off();
        vi.useRealTimers();
    });

    test('/ocenkamienie asks the game to evaluate stones', async () => {
        await client.sendCommand('/ocenkamienie');

        expect(commands).toContain('ocen kamienie');
    });

    test('sums the values it sees and prints a total', async () => {
        await client.sendCommand('/ocenkamienie');

        client.onLine('Wydaje ci sie, ze jest warty okolo 120 miedziakow.', 'text');
        client.onLine('Wydaje ci sie, ze sa warte okolo 80 miedziakow.', 'text');

        vi.advanceTimersByTime(700);

        expect(output()).toContain('Laczna wartosc kamieni:');
    });

    test('the evaluated lines stay visible', async () => {
        await client.sendCommand('/ocenkamienie');

        const parts = client.onLine('Wydaje ci sie, ze jest warty okolo 120 miedziakow.', 'text');

        expect(parts).toHaveLength(1);
        vi.advanceTimersByTime(700);
    });

    test.each([
        'Wydaje ci sie, ze jest warty okolo 120 miedziakow.',
        'Jest tu 5 sztuk wartych 120 miedziakow.',
        'Sa tu 3 sztuki warte 120 miedziakow.',
        'Wydaje ci sie, ze jest tu 5 sztuk wartych 120 miedziakow.',
    ])('recognises: %s', async (line) => {
        await client.sendCommand('/ocenkamienie');

        client.onLine(line, 'text');
        vi.advanceTimersByTime(700);

        expect(output()).toContain('Laczna wartosc kamieni:');
    });

    test('prints nothing when no stone was evaluated', async () => {
        await client.sendCommand('/ocenkamienie');

        vi.advanceTimersByTime(700);

        expect(output()).not.toContain('Laczna wartosc kamieni:');
    });

    test('stops listening once the window closes', async () => {
        await client.sendCommand('/ocenkamienie');
        vi.advanceTimersByTime(700);
        printed.length = 0;

        client.onLine('Wydaje ci sie, ze jest warty okolo 120 miedziakow.', 'text');
        vi.advanceTimersByTime(700);

        expect(output()).not.toContain('Laczna wartosc kamieni:');
    });

    test('a second run starts from zero', async () => {
        await client.sendCommand('/ocenkamienie');
        client.onLine('Wydaje ci sie, ze jest warty okolo 120 miedziakow.', 'text');
        vi.advanceTimersByTime(700);
        const first = output();
        printed.length = 0;

        await client.sendCommand('/ocenkamienie');
        client.onLine('Wydaje ci sie, ze jest warty okolo 1 miedziaka.', 'text');
        vi.advanceTimersByTime(700);

        expect(output()).not.toBe(first);
    });
});

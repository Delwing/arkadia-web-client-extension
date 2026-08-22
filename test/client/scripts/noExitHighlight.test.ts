import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initNoExitHighlight from '@client/scripts/noExitHighlight';

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

const TAN = '#d2b48c';

describe('noExitHighlight', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initNoExitHighlight(client);
    });

    test.each([
        'Nie widzisz zadnego wyjscia prowadzacego na polnoc.',
        'Jestes tak zmeczony, ze nie mozesz dalej podazac w tym kierunku.',
        'Jestes tak zmeczona, ze nie mozesz dalej podazac w tym kierunku.',
    ])('highlights: %s', (line) => {
        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(line);
        expect(out.toHtml()).toContain(TAN);
    });

    test('works on a prompt-prefixed line', () => {
        const [out] = client.onLine('> Nie widzisz zadnego wyjscia prowadzacego na wschod.', 'text');

        expect(out.toHtml()).toContain(TAN);
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Idziesz na polnoc.', 'text');

        expect(out.toHtml()).not.toContain(TAN);
    });
});

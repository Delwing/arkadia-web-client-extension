import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initAligatorEmoji from '@client/scripts/aligatorEmoji';

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

describe('aligatorEmoji', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initAligatorEmoji(client);
    });

    test.each([
        'Dostrzegasz jakis ruch w pobliskich szuwarach. Cos zbliza sie do Ala!',
        'Cos zbliza sie do ciebie przez pobliskie szuwary!',
    ])('marks the warning with a crocodile: %s', (line) => {
        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(`${line} \u{1F40A}`);
    });

    test('the warning is coloured and fades', () => {
        const [out] = client.onLine('Cos zbliza sie do ciebie przez pobliskie szuwary!', 'text');

        expect(out.toHtml()).toContain('#2ffb2f');
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Rozgladasz sie po szuwarach.', 'text');

        expect(out.text).toBe('Rozgladasz sie po szuwarach.');
    });
});

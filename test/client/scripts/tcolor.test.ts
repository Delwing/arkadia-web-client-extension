import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initTcolor from '@client/scripts/tcolor';

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

const ORANGE = '#ffa500';

describe('tcolor', () => {
    let client: Client;
    let printed: string[];

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        client = createClient(printed);
        initTcolor(client, client.aliases);
    });

    test('nothing is coloured before a phrase is registered', () => {
        const [out] = client.onLine('Wielki szczur gryzie cie w noge.', 'text');

        expect(out.toHtml()).not.toContain(ORANGE);
    });

    test('/tcolor confirms the phrase it registered', async () => {
        await client.sendCommand('/tcolor szczur');

        expect(output()).toContain('Tymczasowe kolorowanie dodane: "szczur"');
    });

    test('a registered phrase is highlighted in later output', async () => {
        await client.sendCommand('/tcolor szczur');

        const [out] = client.onLine('Wielki szczur gryzie cie w noge.', 'text');

        expect(out.text).toBe('Wielki szczur gryzie cie w noge.');
        expect(out.toHtml()).toContain(ORANGE);
    });

    test('matching is case-insensitive', async () => {
        await client.sendCommand('/tcolor SZCZUR');

        const [out] = client.onLine('Wielki szczur gryzie cie w noge.', 'text');

        expect(out.toHtml()).toContain(ORANGE);
    });

    test('several phrases can be active at once', async () => {
        await client.sendCommand('/tcolor szczur');
        await client.sendCommand('/tcolor goblin');

        expect(client.onLine('Wielki szczur nadchodzi.', 'text')[0].toHtml()).toContain(ORANGE);
        expect(client.onLine('Maly goblin nadchodzi.', 'text')[0].toHtml()).toContain(ORANGE);
    });

    test('lines without the phrase stay untouched', async () => {
        await client.sendCommand('/tcolor szczur');

        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.toHtml()).not.toContain(ORANGE);
    });

    test('surrounding whitespace in the phrase is trimmed', async () => {
        await client.sendCommand('/tcolor   szczur  ');

        expect(client.onLine('Wielki szczur nadchodzi.', 'text')[0].toHtml()).toContain(ORANGE);
    });
});

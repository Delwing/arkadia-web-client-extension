import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initMagikZnika from '@client/scripts/magikZnika';

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

const LINE = 'Bialy, zimny plomien ogarnia maga, w kilka chwil spopielajac go calkowicie.';

describe('magikZnika', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initMagikZnika(client);
    });

    test('flags the vanishing mage with a banner', () => {
        const [out] = client.onLine(LINE, 'text');

        expect(out.text).toBe(`\n\t[  MAGIK ZNIKA   ] ${LINE}\n`);
    });

    test('the banner is coloured', () => {
        const [out] = client.onLine(LINE, 'text');

        expect(out.toHtml()).toContain('#ff6347');
    });

    test('a partial match is not enough', () => {
        const line = 'Bialy, zimny plomien ogarnia maga.';

        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(line);
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
    });
});

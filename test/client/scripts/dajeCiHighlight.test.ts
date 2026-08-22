import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initDajeCiHighlight from '@client/scripts/dajeCiHighlight';

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

const TURQUOISE = '#40e0d0';

describe('dajeCiHighlight', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initDajeCiHighlight(client);
    });

    test('highlights a reflexive "daje ci sie ..." message', () => {
        const [out] = client.onLine('Ala daje ci sie w kosc.', 'text');

        expect(out.text).toBe('Ala daje ci sie w kosc.');
        expect(out.toHtml()).toContain(TURQUOISE);
    });

    test('leaves a plain gift alone', () => {
        const [out] = client.onLine('Ala daje ci zloty pierscien.', 'text');

        expect(out.toHtml()).not.toContain(TURQUOISE);
    });

    test('"nowy zapal do walki." is explicitly excluded', () => {
        // It does not start with "sie " either, but the script guards it by
        // name — pin that so the guard is not dropped as redundant.
        const [out] = client.onLine('Ala daje ci nowy zapal do walki.', 'text');

        expect(out.toHtml()).not.toContain(TURQUOISE);
    });

    test('works on a prompt-prefixed line', () => {
        const [out] = client.onLine('> Ala daje ci sie we znaki.', 'text');

        expect(out.toHtml()).toContain(TURQUOISE);
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.toHtml()).not.toContain(TURQUOISE);
    });
});

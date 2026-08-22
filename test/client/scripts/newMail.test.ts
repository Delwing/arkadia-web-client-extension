import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initNewMail from '@client/scripts/newMail';

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

describe('newMail', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initNewMail(client);
    });

    test('announces new mail with a banner', () => {
        const [out] = client.onLine('Masz nowa poczte od Ala.', 'text');

        expect(out.text).toBe('\n[ POCZTA ] Masz nowa poczte od Ala.\n\n');
    });

    test('the banner is coloured', () => {
        const [out] = client.onLine('Masz nowa poczte od Ala.', 'text');

        expect(out.toHtml()).toContain('#ff6347');
    });

    test('only fires on the exact announcement', () => {
        const line = 'Masz nowa poczte od Ala i Beli.';

        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(line);
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
    });
});

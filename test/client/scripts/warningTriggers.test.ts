import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initWarningTriggers from '@client/scripts/warningTriggers';

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

const BROKEN_COMPASS =
    'Widzisz jak igla twojego kompasu peka, a cale urzadzenie po prostu rozpada ci sie w rekach.';

describe('warningTriggers', () => {
    let client: Client;
    let sounds: string[];
    let off: () => void;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        sounds = [];
        off = client.on('sound:category', (c: string) => { sounds.push(c); });
        initWarningTriggers(client);
    });

    afterEach(() => off());

    test('a broken compass is prefixed and reddened', () => {
        const [out] = client.onLine(BROKEN_COMPASS, 'text');

        expect(out.text).toBe(`[ SPRZET ] ${BROKEN_COMPASS}`);
        expect(out.toHtml()).toContain('#ff0000');
    });

    test('it plays the gear sound', () => {
        client.onLine(BROKEN_COMPASS, 'text');

        expect(sounds).toEqual(['gear']);
    });

    test('unrelated output is untouched and silent', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
        expect(sounds).toEqual([]);
    });
});

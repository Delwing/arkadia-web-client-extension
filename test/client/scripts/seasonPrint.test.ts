import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import { setGmcp } from '@client/gmcp';
import initSeasonPrint from '@client/scripts/seasonPrint';

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

const ELDER = 'Jest w przyblizeniu poludnie, trzeci dzien pory kwietnia wedlug rachuby czasu Starszego Ludu.';
const IMPERIAL = 'Jest w przyblizeniu pozne poludnie, drugi dzien miesiaca kwietnia wedlug Kalendarza Imperialnego.';

describe('seasonPrint', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initSeasonPrint(client);
    });

    test.each([
        [0, '[ WIOSNA ]', '#00ff7f'],
        [1, '[ LATO ]', '#ffff00'],
        [2, '[ JESIEN ]', '#ff8c00'],
        [3, '[ ZIMA ]', '#00bfff'],
    ])('season %i appends %s', (season, label, color) => {
        setGmcp('room.time', { season });

        const [out] = client.onLine(ELDER, 'text');

        expect(out.text).toBe(`${ELDER} ${label}`);
        expect(out.toHtml()).toContain(color);
    });

    test('the Imperial calendar line is annotated too', () => {
        setGmcp('room.time', { season: 1 });

        const [out] = client.onLine(IMPERIAL, 'text');

        expect(out.text).toBe(`${IMPERIAL} [ LATO ]`);
    });

    test('nothing is appended when the season is unknown', () => {
        setGmcp('room.time', {});

        const [out] = client.onLine(ELDER, 'text');

        expect(out.text).toBe(ELDER);
    });

    test('an out-of-range season is ignored', () => {
        setGmcp('room.time', { season: 9 });

        const [out] = client.onLine(ELDER, 'text');

        expect(out.text).toBe(ELDER);
    });

    test('unrelated output is untouched', () => {
        setGmcp('room.time', { season: 0 });

        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
    });
});

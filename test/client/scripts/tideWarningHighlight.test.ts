import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initTideWarningHighlight from '@client/scripts/tideWarningHighlight';

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

const HIGHLIGHT = '#ffffaa';

const WARNINGS = [
    'Pod twoimi stopami wzbieraja coraz wieksze strumyki, a po chwili czujesz, ze poziom wody zaczyna sie powoli podnosic. Wkrotce zacznie sie przyplyw.',
    'Poziom wody powoli sie podnosi. Coraz bardziej zbliza sie przyplyw.',
    'Poziom wody coraz gwaltowniej sie podnosi. Fale przyplywu moga nadejsc w kazdej chwili!',
    'Poziom wody wyraznie opada. Coraz bardziej zbliza sie pora odplywu.',
    'Poziom wody coraz gwaltowniej opada. Morskie fale moga sie cofnac niemal w kazdej chwili!',
    'Falujace morze wolno, acz systematycznie obniza swoj poziom, oddajac swiatu zagarniety lad.',
];

describe('tideWarningHighlight', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initTideWarningHighlight(client);
    });

    test.each(WARNINGS)('highlights: %s', (line) => {
        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(line);
        expect(out.toHtml()).toContain(HIGHLIGHT);
    });

    test('works on a prompt-prefixed line', () => {
        const [out] = client.onLine(`> ${WARNINGS[1]}`, 'text');

        expect(out.toHtml()).toContain(HIGHLIGHT);
    });

    test('unrelated sea talk is untouched', () => {
        const [out] = client.onLine('Morze jest dzis spokojne.', 'text');

        expect(out.toHtml()).not.toContain(HIGHLIGHT);
    });
});

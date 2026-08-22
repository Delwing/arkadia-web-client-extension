import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initWyroznienieOptions from '@client/scripts/wyroznienieOptions';

function createClient(sent: string[] = []): Client {
    return new Client({
        send: (text: string) => { sent.push(text); },
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

const HEADER = 'Tytul zwiazany z WYROZNIENIEm:    Wedrowiec';

describe('wyroznienieOptions', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initWyroznienieOptions(client);
    });

    describe('the header line', () => {
        test('a normal title gets a clickable "wylacz" affordance appended', () => {
            const [out] = client.onLine(HEADER, 'text');

            expect(out.text).toBe('Tytul zwiazany z WYROZNIENIEm:    Wedrowiec [ wylacz ]');
        });

        test('"Niewidoczny" is only recoloured — nothing is appended', () => {
            const line = 'Tytul zwiazany z WYROZNIENIEm:    Niewidoczny';

            const [out] = client.onLine(line, 'text');

            expect(out.text).toBe(line);
        });

        test('an unrelated line is untouched', () => {
            const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

            expect(out.text).toBe('Jestes lekko zmeczony.');
        });
    });

    describe('the option list', () => {
        test('indented lines become options once "Do wyboru sa:" has been seen', () => {
            client.onLine('Do wyboru sa:', 'text');

            const [out] = client.onLine('    Wedrowiec', 'text');

            expect(out.text).toBe('    Wedrowiec');
            expect(out.toHtml()).toContain('data-output-clickable');
        });

        test('a tab-indented option is normalised to four spaces', () => {
            client.onLine('Do wyboru sa:', 'text');

            const [out] = client.onLine('\tPocztylion', 'text');

            expect(out.text).toBe('    Pocztylion');
        });

        test('indented lines are left alone when no list is open', () => {
            const [out] = client.onLine('    Wedrowiec', 'text');

            expect(out.text).toBe('    Wedrowiec');
            expect(out.toHtml()).not.toContain('data-output-clickable');
        });

        test('"Do wyboru sa:" itself passes through unchanged', () => {
            const [out] = client.onLine('Do wyboru sa:', 'text');

            expect(out.text).toBe('Do wyboru sa:');
        });
    });

    describe('closing the list', () => {
        // Pins current behaviour: the first non-indented line after an option
        // block is SUPPRESSED, not just used as a terminator. Worth a second
        // look — see docs/SCRIPT_DEPENDENCIES.md.
        test('the first non-indented line after the options is swallowed', () => {
            client.onLine('Do wyboru sa:', 'text');
            client.onLine('    Wedrowiec', 'text');

            const parts = client.onLine('Jestes lekko zmeczony.', 'text');

            expect(parts).toHaveLength(0);
        });

        test('once closed, later indented lines are no longer options', () => {
            client.onLine('Do wyboru sa:', 'text');
            client.onLine('    Wedrowiec', 'text');
            client.onLine('Jestes lekko zmeczony.', 'text');

            const [out] = client.onLine('    Pocztylion', 'text');

            expect(out.toHtml()).not.toContain('data-output-clickable');
        });

        test('the terminator only fires once', () => {
            client.onLine('Do wyboru sa:', 'text');
            client.onLine('    Wedrowiec', 'text');
            client.onLine('Jestes lekko zmeczony.', 'text');

            const parts = client.onLine('Rozgladasz sie dookola.', 'text');

            expect(parts).toHaveLength(1);
        });
    });
});

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initIntroduced from '@client/scripts/introduced';

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

const remembered = (names: string) => `Zapamietane przez ciebie imiona to ${names}.`;
const introducedLine = (names: string) => `Osoby, ktore zostaly ci ostatnio przedstawione, to ${names}.`;

describe('introduced', () => {
    let client: Client;
    let printed: string[];
    let commands: string[];
    let offCommand: () => void;

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
        commands = [];
        client = createClient(printed);
        const sink = commands;
        offCommand = client.on('command', (c: string) => { sink.push(c); });
        initIntroduced(client, client.aliases);
    });

    afterEach(() => {
        offCommand();
        client.commandProcessor.unregisterCommandHook('introduced-command-hook');
    });

    describe('remembered names', () => {
        test('the reply is only captured after the command was issued', async () => {
            const before = client.onLine(remembered('Adas, Bodas i Codas'), 'text');
            expect(before[0].text).toBe(remembered('Adas, Bodas i Codas'));

            await client.sendCommand('zapamietani');
            const after = client.onLine(remembered('Adas, Bodas i Codas'), 'text');

            expect(after[0].text).toContain('[3] Zapamietane');
        });

        test('names are parsed out of the comma/i list and stored', async () => {
            await client.sendCommand('zapamietani');

            client.onLine(remembered('Adas, Bodas i Codas'), 'text');

            expect(characterStorage.get('introduced_remembered')).toEqual(['Adas', 'Bodas', 'Codas']);
        });

        test('a single name works too', async () => {
            await client.sendCommand('zapamietani');

            const [out] = client.onLine(remembered('Adas'), 'text');

            expect(out.text).toContain('[1] Zapamietane');
        });

        test('names dropped since last time are reported', async () => {
            await client.sendCommand('zapamietani');
            client.onLine(remembered('Adas, Bodas i Codas'), 'text');
            output();

            await client.sendCommand('zapamietani');
            client.onLine(remembered('Adas i Codas'), 'text');

            expect(output()).toContain('Osoby usuniete z zapamietanych: Bodas');
        });

        test('nothing is reported when nobody was dropped', async () => {
            await client.sendCommand('zapamietani');
            client.onLine(remembered('Adas i Bodas'), 'text');
            output();

            await client.sendCommand('zapamietani');
            client.onLine(remembered('Adas, Bodas i Codas'), 'text');

            expect(output()).not.toContain('Osoby usuniete');
        });

        test('the trigger only fires once per command', async () => {
            await client.sendCommand('zapamietani');
            client.onLine(remembered('Adas'), 'text');

            const [second] = client.onLine(remembered('Adas i Bodas'), 'text');

            expect(second.text).not.toContain('[2]');
        });
    });

    describe('recently introduced people', () => {
        test('the count is prefixed', async () => {
            await client.sendCommand('przedstawieni');

            const [out] = client.onLine(introducedLine('Adas, Bodas i Codas'), 'text');

            expect(out.text).toContain('[3] Osoby');
        });

        test('people not yet remembered get a click-to-remember link', async () => {
            await client.sendCommand('przedstawieni');

            const [out] = client.onLine(introducedLine('Adas i Bodas'), 'text');

            expect(out.toHtml()).toContain('data-output-clickable');
            expect(out.toHtml()).toContain('zapamietaj imie Adas');
        });

        test('already-remembered people are not linked', async () => {
            await client.sendCommand('zapamietani');
            client.onLine(remembered('Adas i Bodas'), 'text');

            await client.sendCommand('przedstawieni');
            const [out] = client.onLine(introducedLine('Adas i Bodas'), 'text');

            expect(out.toHtml()).not.toContain('data-output-clickable');
        });

        test('the list is stored', async () => {
            await client.sendCommand('przedstawieni');

            client.onLine(introducedLine('Adas i Bodas'), 'text');

            expect(characterStorage.get('introduced_presented')).toEqual(['Adas', 'Bodas']);
        });
    });

    describe('/przedstawieni', () => {
        test('asks the game for both lists', async () => {
            await client.sendCommand('/przedstawieni');

            expect(commands).toContain('zapamietani');
            expect(commands).toContain('przedstawieni');
        });
    });

    test('the command hook leaves the command unchanged', async () => {
        await client.sendCommand('zapamietani');

        expect(commands).toEqual(['zapamietani']);
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
    });
});

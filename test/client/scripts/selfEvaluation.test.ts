import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initSelfEvaluation from '@client/scripts/selfEvaluation';

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

describe('selfEvaluation', () => {
    let client: Client;
    let printed: string[];
    let commands: string[];
    let offCommand: () => void;

    /** `print` buffers while a line is being processed — force the flush. */
    function output() {
        client.sendEvent('output-sent', 1);
        return printed.join('');
    }

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        commands = [];
        client = createClient(printed);
        offCommand = client.on('command', (cmd: string) => { commands.push(cmd); });
        initSelfEvaluation(client, client.aliases);
    });

    afterEach(() => {
        offCommand();
        vi.useRealTimers();
    });

    describe('/ocen — weapons and armour', () => {
        test('asks the game for both weapon and armour evaluations', async () => {
            await client.sendCommand('/ocen');

            expect(commands).toEqual(['ocen swoje bronie', 'ocen swoje zbroje']);
        });

        test('/sprzet is an alias for the same run', async () => {
            await client.sendCommand('/sprzet');

            expect(commands).toEqual(['ocen swoje bronie', 'ocen swoje zbroje']);
        });

        test('suppresses per-item evaluation while the run is in flight', async () => {
            expect(client.suppressItemEvaluation).toBe(false);

            await client.sendCommand('/ocen');

            expect(client.suppressItemEvaluation).toBe(true);
        });

        test('swallows the raw evaluation lines', async () => {
            await client.sendCommand('/ocen');

            expect(client.onLine('Oceniasz swoj miecz krotki.', 'text')).toHaveLength(0);
            expect(client.onLine('Wyglada na to, ze jest w znakomitym stanie.', 'text')).toHaveLength(0);
        });

        test('prints a summary line per item once the run settles', async () => {
            await client.sendCommand('/ocen');
            client.onLine('Oceniasz swoj miecz krotki.', 'text');
            client.onLine('Wyglada na to, ze jest w znakomitym stanie.', 'text');

            vi.advanceTimersByTime(250);

            const out = output();
            expect(out).toContain('miecz krotki');
            expect(out).toContain('[max]');
        });

        test.each([
            ['w znakomitym stanie', '[max]'],
            ['lekko podniszczony', '[4/5]'],
            ['w kiepskim stanie', '[3/5]'],
            ['w oplakanym stanie', '[2/5]'],
            ['gotowy sie rozpasc', '[1/5]'],
            ['w dobrym stanie', '[6/7]'],
            ['w zlym stanie', '[4/7]'],
        ])('%s reads as %s', async (phrase, state) => {
            await client.sendCommand('/ocen');
            client.onLine('Oceniasz swoj miecz krotki.', 'text');
            client.onLine(`Wyglada na to, ze jest ${phrase}.`, 'text');

            vi.advanceTimersByTime(250);

            expect(output()).toContain(state);
        });

        test('an unrecognised condition is dropped rather than guessed', async () => {
            await client.sendCommand('/ocen');
            client.onLine('Oceniasz swoj miecz krotki.', 'text');
            client.onLine('Wyglada na to, ze jest calkiem zielony.', 'text');

            vi.advanceTimersByTime(250);

            expect(output()).not.toContain('miecz krotki');
        });

        test('collects several items into one summary', async () => {
            await client.sendCommand('/ocen');
            client.onLine('Oceniasz swoj miecz krotki.', 'text');
            client.onLine('Wyglada na to, ze jest w znakomitym stanie.', 'text');
            client.onLine('Oceniasz swoj helm stalowy.', 'text');
            client.onLine('Wyglada na to, ze jest w kiepskim stanie.', 'text');

            vi.advanceTimersByTime(250);

            const out = output();
            expect(out).toContain('miecz krotki');
            expect(out).toContain('helm stalowy');
            expect(out).toContain('[max]');
            expect(out).toContain('[3/5]');
        });

        test('the run releases the suppression flag when it settles', async () => {
            await client.sendCommand('/ocen');
            client.onLine('Oceniasz swoj miecz krotki.', 'text');
            client.onLine('Wyglada na to, ze jest w znakomitym stanie.', 'text');

            vi.advanceTimersByTime(250);

            expect(client.suppressItemEvaluation).toBe(false);
        });

        test('a run that never gets a reply is abandoned after the fallback', async () => {
            await client.sendCommand('/ocen');

            vi.advanceTimersByTime(5000);

            expect(client.suppressItemEvaluation).toBe(false);
            // Triggers were removed, so later output is no longer swallowed.
            expect(client.onLine('Oceniasz swoj miecz krotki.', 'text')).toHaveLength(1);
        });

        test('unrelated output is untouched before a run starts', () => {
            const parts = client.onLine('Jestes lekko zmeczony.', 'text');

            expect(parts).toHaveLength(1);
            expect(parts[0].text).toBe('Jestes lekko zmeczony.');
        });
    });

    describe('/ubrania — clothing', () => {
        test('asks the game to evaluate clothing', async () => {
            await client.sendCommand('/ubrania');

            expect(commands).toEqual(['ocen ubrania']);
        });

        test('swallows the raw lines and summarises the wear value', async () => {
            await client.sendCommand('/ubrania');

            expect(client.onLine('Oceniasz starannie plaszcz podrozny.', 'text')).toHaveLength(0);
            expect(
                client.onLine('Ubranie to zostalo wykonane z welny i wyglada na w miare nowe.', 'text')
            ).toHaveLength(0);

            vi.advanceTimersByTime(250);

            const out = output();
            expect(out).toContain('plaszcz podrozny');
            expect(out).toContain('[4/5]');
        });

        test.each([
            ['calkiem nowe', '[5/5]'],
            ['w miare nowe', '[4/5]'],
            ['troche znoszone', '[3/5]'],
            ['prawie calkiem znoszone', '[2/5]'],
        ])('%s reads as %s', async (phrase, state) => {
            await client.sendCommand('/ubrania');
            client.onLine('Oceniasz starannie plaszcz podrozny.', 'text');
            client.onLine(`Ubranie to zostalo wykonane z welny i wyglada na ${phrase}.`, 'text');

            vi.advanceTimersByTime(250);

            expect(output()).toContain(state);
        });

        test('the clothing run also releases the suppression flag', async () => {
            await client.sendCommand('/ubrania');
            client.onLine('Oceniasz starannie plaszcz podrozny.', 'text');
            client.onLine('Ubranie to zostalo wykonane z welny i wyglada na w miare nowe.', 'text');

            vi.advanceTimersByTime(250);

            expect(client.suppressItemEvaluation).toBe(false);
        });
    });
});

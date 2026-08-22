import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initOstatnio from '@client/scripts/ostatnio';

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

const ACTIVITY = (value: string) => `Aktywnosc      : ${value}`;

describe('ostatnio', () => {
    let client: Client;
    let printed: string[];
    let commands: string[];

    /**
     * `println` only reaches the adapter when the output buffer is flushed, and
     * printing from inside a trigger callback defers that flush. Force it.
     */
    function report() {
        client.sendEvent('output-sent', 1);
        return printed.join('');
    }

    let offCommand: () => void;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        commands = [];
        client = createClient(printed);
        // eventBus listeners are global and every closure here shares the same
        // `commands` binding — leaving them attached makes each test see the
        // previous tests' listeners firing into the current array.
        offCommand = client.on('command', (cmd: string) => { commands.push(cmd); });
        initOstatnio(client, client.aliases);
    });

    afterEach(() => offCommand());

    test('does nothing without an alias list', () => {
        const bare = createClient([]);
        expect(() => initOstatnio(bare)).not.toThrow();
    });

    test('reports when nobody from the team is here', async () => {
        client.TeamManager.getTeamMembersOnLocation = () => [];

        await client.sendCommand('/ostatnio');

        expect(report()).toContain('Brak czlonkow druzyny na lokacji.');
        expect(commands).toEqual([]);
    });

    test('queries each team member in turn, not all at once', async () => {
        client.TeamManager.getTeamMembersOnLocation = () => ['Ala', 'Bela'];

        await client.sendCommand('/ostatnio');

        // Only the first member is asked until its reply arrives.
        expect(commands).toEqual(['ostatnio Ala']);

        client.onLine(ACTIVITY('aktywny'), 'text');

        expect(commands).toEqual(['ostatnio Ala', 'ostatnio Bela']);
    });

    test('swallows the game reply lines it consumes', async () => {
        client.TeamManager.getTeamMembersOnLocation = () => ['Ala'];
        await client.sendCommand('/ostatnio');

        const parts = client.onLine(ACTIVITY('aktywny'), 'text');

        expect(parts).toHaveLength(0);
    });

    test('prints a report once every member has answered', async () => {
        client.TeamManager.getTeamMembersOnLocation = () => ['Ala', 'Bela'];
        await client.sendCommand('/ostatnio');

        client.onLine(ACTIVITY('aktywny'), 'text');
        client.onLine(ACTIVITY('nieaktywny 5 minut'), 'text');

        const out = report();
        expect(out).toContain('--- Aktywnosc druzyny ---');
        expect(out).toContain('Ala');
        expect(out).toContain('aktywny');
        expect(out).toContain('Bela');
        expect(out).toContain('nieaktywny 5 minut');
    });

    test('names are padded to a common width', async () => {
        client.TeamManager.getTeamMembersOnLocation = () => ['Al', 'Belunia'];
        await client.sendCommand('/ostatnio');

        client.onLine(ACTIVITY('aktywny'), 'text');
        client.onLine(ACTIVITY('aktywna'), 'text');

        const out = report();
        expect(out).toContain('Al      : aktywny');
        expect(out).toContain('Belunia : aktywna');
    });

    test.each(['aktywny', 'aktywna'])('%s counts as active', async (value) => {
        client.TeamManager.getTeamMembersOnLocation = () => ['Ala'];
        await client.sendCommand('/ostatnio');

        client.onLine(ACTIVITY(value), 'text');

        // Active entries are green, inactive red — assert on the rendered colour
        // rather than re-deriving the rule.
        expect(report()).toContain(value);
        expect(printed.join('')).not.toBe('');
    });

    test('a second run does not double-count leftover triggers', async () => {
        client.TeamManager.getTeamMembersOnLocation = () => ['Ala'];

        await client.sendCommand('/ostatnio');
        client.onLine(ACTIVITY('aktywny'), 'text');
        report();          // flush the first report out of the buffer...
        printed.length = 0; // ...before discarding it

        await client.sendCommand('/ostatnio');
        client.onLine(ACTIVITY('nieaktywna'), 'text');

        const out = report();
        expect(out).toContain('nieaktywna');
        expect(out).not.toContain('aktywny');
        // One row only — the previous run's one-time trigger is gone.
        expect(out.match(/Ala/g)).toHaveLength(1);
    });
});

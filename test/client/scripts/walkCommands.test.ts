import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initWalkCommands from '@client/scripts/walkCommands';

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

describe('walkCommands', () => {
    let client: Client;
    let printed: string[];

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
        client = createClient(printed);
        initWalkCommands(client, client.aliases);
    });

    /** '#' is a command separator unless the input came from the user. */
    const type = (cmd: string) => client.sendCommand(cmd, true, undefined, false, true);

    test('/pre_walk sets the commands run before a walk', async () => {
        await type('/pre_walk wstan#dobadz miecza');

        expect(client.preWalkCommands).toEqual(['wstan', 'dobadz miecza']);
        expect(output()).toContain('Pre-walk: wstan, dobadz miecza');
    });

    test('/post_walk sets the commands run after a walk', async () => {
        await client.sendCommand('/post_walk schowaj miecz');

        expect(client.postWalkCommands).toEqual(['schowaj miecz']);
        expect(output()).toContain('Post-walk: schowaj miecz');
    });

    test('surrounding whitespace and empty segments are dropped', async () => {
        await type('/pre_walk  wstan #  # dobadz miecza ');

        expect(client.preWalkCommands).toEqual(['wstan', 'dobadz miecza']);
    });

    test('/pre_walk- clears them', async () => {
        await client.sendCommand('/pre_walk wstan');
        await client.sendCommand('/pre_walk-');

        expect(client.preWalkCommands).toEqual([]);
        expect(output()).toContain('Pre-walk wyczyszczone.');
    });

    test('/post_walk- clears them', async () => {
        await client.sendCommand('/post_walk schowaj miecz');
        await client.sendCommand('/post_walk-');

        expect(client.postWalkCommands).toEqual([]);
        expect(output()).toContain('Post-walk wyczyszczone.');
    });

    test('pre and post lists are independent', async () => {
        await client.sendCommand('/pre_walk wstan');
        await client.sendCommand('/post_walk siadaj');

        expect(client.preWalkCommands).toEqual(['wstan']);
        expect(client.postWalkCommands).toEqual(['siadaj']);
    });
});

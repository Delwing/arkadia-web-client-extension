import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initDobOp from '@client/scripts/dobOp';

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

describe('dobOp', () => {
    let client: Client;
    let commands: string[];
    let off: () => void;

    function setup(settings: Record<string, string>) {
        characterStorage.set('settings', settings as any);
        client = createClient();
        commands = [];
        off = client.on('command', (c: string) => { commands.push(c); });
        initDobOp(client, client.aliases);
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        off = () => {};
    });

    afterEach(() => off());

    test('does nothing without an alias list', () => {
        expect(() => initDobOp(createClient())).not.toThrow();
    });

    test('/dob runs the first two draw slots', async () => {
        setup({ dobCommand1: 'dobadz miecza', dobCommand2: 'dobadz tarczy', dobCommand3: 'dobadz luku' });

        await client.sendCommand('/dob');

        expect(commands).toEqual(['dobadz miecza', 'dobadz tarczy']);
    });

    test('/dob N runs only that slot', async () => {
        setup({ dobCommand1: 'dobadz miecza', dobCommand3: 'dobadz luku' });

        await client.sendCommand('/dob 3');

        expect(commands).toEqual(['dobadz luku']);
    });

    test('/op runs the first two sheathe slots', async () => {
        setup({ opCommand1: 'schowaj miecz', opCommand2: 'schowaj tarcze' });

        await client.sendCommand('/op');

        expect(commands).toEqual(['schowaj miecz', 'schowaj tarcze']);
    });

    test('/op N runs only that slot', async () => {
        setup({ opCommand2: 'schowaj tarcze' });

        await client.sendCommand('/op 2');

        expect(commands).toEqual(['schowaj tarcze']);
    });

    test('a slot may hold several semicolon-separated commands', async () => {
        setup({ dobCommand1: 'wstan; dobadz miecza ;;dobadz tarczy' });

        await client.sendCommand('/dob 1');
        // The slot-argument aliases fire and forget rather than returning their
        // promise, so the queue drains after the command resolves.
        await new Promise(r => setTimeout(r, 0));

        expect(commands).toEqual(['wstan', 'dobadz miecza', 'dobadz tarczy']);
    });

    test('an empty slot is skipped', async () => {
        setup({ dobCommand1: '', dobCommand2: 'dobadz tarczy' });

        await client.sendCommand('/dob');

        expect(commands).toEqual(['dobadz tarczy']);
    });

    test('changing the setting takes effect without a restart', async () => {
        setup({ dobCommand1: 'dobadz miecza' });

        characterStorage.set('settings', { dobCommand1: 'dobadz topora' } as any);
        await client.sendCommand('/dob 1');

        expect(commands).toEqual(['dobadz topora']);
    });
});

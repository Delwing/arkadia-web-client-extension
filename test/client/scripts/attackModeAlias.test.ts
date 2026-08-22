import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';
import initAttackModeAlias from '@client/scripts/attackModeAlias';

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

describe('attackModeAlias', () => {
    let client: Client;
    let printed: string[];
    let modes: string[];
    let off: () => void;

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
        modes = [];
        client = createClient(printed);
        off = eventBus.on('attackMode', (m: string) => { modes.push(m); });
        initAttackModeAlias(client, client.aliases);
    });

    afterEach(() => off());

    test('/awr cycles A -> AW -> AWR -> A', async () => {
        await client.sendCommand('/awr');
        expect(modes.at(-1)).toBe('AW');

        await client.sendCommand('/awr');
        expect(modes.at(-1)).toBe('AWR');

        await client.sendCommand('/awr');
        expect(modes.at(-1)).toBe('A');
    });

    test('it announces the new mode', async () => {
        await client.sendCommand('/awr');

        expect(output()).toContain('Tryb ataku: AW (atak + wskazanie)');
    });

    test('it starts from the stored mode', async () => {
        characterStorage.set('attack_mode', 'AWR' as any);
        const fresh = createClient([]);
        initAttackModeAlias(fresh, fresh.aliases);
        modes.length = 0;

        await fresh.sendCommand('/awr');

        expect(modes.at(-1)).toBe('A');
    });

    test('an externally announced mode moves the cycle position', async () => {
        eventBus.emit('attackMode', 'AWR');
        modes.length = 0;

        await client.sendCommand('/awr');

        expect(modes.at(-1)).toBe('A');
    });

    test('an unknown mode announcement is ignored', async () => {
        eventBus.emit('attackMode', 'NONSENSE' as any);
        modes.length = 0;

        await client.sendCommand('/awr');

        expect(modes.at(-1)).toBe('AW');
    });
});

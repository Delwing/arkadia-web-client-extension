import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initBilety from '@client/scripts/bilety';

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

describe('bilety', () => {
    let client: Client;
    let printed: string[];
    let commands: string[];
    let off: () => void;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        commands = [];
        client = createClient(printed);
        off = client.on('command', (c: string) => { commands.push(c); });
        initBilety(client, client.aliases);
    });

    afterEach(() => off());

    test('does nothing without an alias list', () => {
        expect(() => initBilety(createClient([]))).not.toThrow();
    });

    test('reports when nobody from the team is here', async () => {
        client.TeamManager.getTeamObjectsOnLocation = () => [];

        await client.sendCommand('/bilety');
        client.sendEvent('output-sent', 1);

        expect(printed.join('')).toContain('Brak czlonkow druzyny na lokacji.');
        expect(commands).toEqual([]);
    });

    test('buys and hands a ticket to each team member, wielding around it', async () => {
        client.TeamManager.getTeamObjectsOnLocation = () => [
            { num: 11, desc: 'Ala' },
            { num: 22, desc: 'Bela' },
        ];

        await client.sendCommand('/bilety');

        expect(commands).toEqual([
            'wem',
            'kup bilet',
            'daj bilet ob_11',
            'kup bilet',
            'daj bilet ob_22',
            'wlm',
        ]);
    });

    test('a single team member still gets the full sequence', async () => {
        client.TeamManager.getTeamObjectsOnLocation = () => [{ num: 7, desc: 'Ala' }];

        await client.sendCommand('/bilety');

        expect(commands).toEqual(['wem', 'kup bilet', 'daj bilet ob_7', 'wlm']);
    });
});

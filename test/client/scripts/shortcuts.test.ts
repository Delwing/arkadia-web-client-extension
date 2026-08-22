import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage, globalStorage } from '@modules/core/storage';
import initShortcuts, { getShortcut } from '@client/scripts/shortcuts';

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

describe('shortcuts', () => {
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
        initShortcuts(client, client.aliases);
        // Module state is a singleton; clear anything a previous test stored.
        globalStorage.set('shortcuts', [] as any);
    });

    test('starts empty', async () => {
        await client.sendCommand('/pokaz_skroty');

        expect(output()).toContain('Brak skrotow.');
    });

    test('/dodaj_skrot registers a room shortcut', async () => {
        await client.sendCommand('/dodaj_skrot 123 bank Bank w Wyzimie');

        expect(getShortcut('bank')).toBe(123);
    });

    test('a quoted name may contain spaces', async () => {
        await client.sendCommand('/dodaj_skrot 55 "bank w wyzimie" Skarbiec');

        expect(getShortcut('bank w wyzimie')).toBe(55);
    });

    test('the label is optional', async () => {
        await client.sendCommand('/dodaj_skrot 7 karczma');

        expect(getShortcut('karczma')).toBe(7);
    });

    test('shortcuts survive as stored data', async () => {
        await client.sendCommand('/dodaj_skrot 123 bank Bank');

        expect(globalStorage.get('shortcuts')).toEqual([
            { key: 'bank', id: 123, label: 'Bank' },
        ]);
    });

    test('/pokaz_skroty lists them with a clickable "prowadz"', async () => {
        await client.sendCommand('/dodaj_skrot 123 bank Bank w Wyzimie');

        await client.sendCommand('/pokaz_skroty');
        const out = output();

        expect(out).toContain('bank');
        expect(out).toContain('123');
        expect(out).toContain('Bank w Wyzimie');
        expect(out).toContain('prowadz');
    });

    test('/usun_skrot removes one', async () => {
        await client.sendCommand('/dodaj_skrot 123 bank');
        await client.sendCommand('/usun_skrot bank');

        expect(getShortcut('bank')).toBeUndefined();
    });

    test('/usun_skrot accepts a quoted name', async () => {
        await client.sendCommand('/dodaj_skrot 55 "bank w wyzimie"');
        await client.sendCommand('/usun_skrot "bank w wyzimie"');

        expect(getShortcut('bank w wyzimie')).toBeUndefined();
    });

    test('/usun_skroty clears everything', async () => {
        await client.sendCommand('/dodaj_skrot 1 a');
        await client.sendCommand('/dodaj_skrot 2 b');

        await client.sendCommand('/usun_skroty');

        expect(getShortcut('a')).toBeUndefined();
        expect(getShortcut('b')).toBeUndefined();
    });

    test('an external storage change is picked up', async () => {
        globalStorage.set('shortcuts', [{ key: 'port', id: 999, label: 'Port' }] as any);

        expect(getShortcut('port')).toBe(999);
    });

    test('re-adding the same key overwrites it', async () => {
        await client.sendCommand('/dodaj_skrot 1 bank');
        await client.sendCommand('/dodaj_skrot 2 bank');

        expect(getShortcut('bank')).toBe(2);
    });
});

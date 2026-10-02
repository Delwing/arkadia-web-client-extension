import Client from '@client/Client';
import type { ClientAdapter } from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import initBagManager, { containerAction, getContainer, getContainerForms, registerContainerType, unregisterContainerType } from '@client/scripts/bagManager';
import { setTestSettings } from '../helpers/testSettings';

describe('bagManager containerAction', () => {
    let client: Client;
    let mockAdapter: jest.Mocked<ClientAdapter>;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        mockAdapter = {
            send: jest.fn(),
            output: jest.fn(),
            sendGmcp: jest.fn(),
            flushMessageBuffer: jest.fn(),
            emit: jest.fn(),
            shouldEchoCommand: jest.fn(() => true),
        };
        client = new Client(mockAdapter);
    });

    function sentCommands(): string[] {
        return mockAdapter.send.mock.calls.map((call) => call[0] as string);
    }

    test('sends open and close by default', () => {
        setTestSettings({ containerOpen: true, containerClose: true });
        containerAction(client, 'other', 'put', 'monety');
        const cmds = sentCommands();
        expect(cmds[0]).toMatch(/^otworz /);
        expect(cmds[cmds.length - 1]).toMatch(/^zamknij /);
    });

    test('skips open when containerOpen is false', () => {
        setTestSettings({ containerOpen: false, containerClose: true });
        containerAction(client, 'other', 'put', 'monety');
        const cmds = sentCommands();
        expect(cmds.every((c) => !c.startsWith('otworz'))).toBe(true);
        expect(cmds[cmds.length - 1]).toMatch(/^zamknij /);
    });

    test('skips close when containerClose is false', () => {
        setTestSettings({ containerOpen: true, containerClose: false });
        containerAction(client, 'other', 'put', 'monety');
        const cmds = sentCommands();
        expect(cmds[0]).toMatch(/^otworz /);
        expect(cmds.every((c) => !c.startsWith('zamknij'))).toBe(true);
    });

    test('skips both open and close when both are false', () => {
        setTestSettings({ containerOpen: false, containerClose: false });
        containerAction(client, 'other', 'put', 'monety');
        const cmds = sentCommands();
        expect(cmds.every((c) => !c.startsWith('otworz'))).toBe(true);
        expect(cmds.every((c) => !c.startsWith('zamknij'))).toBe(true);
        // The put command itself is still sent
        expect(cmds.some((c) => c.startsWith('wloz'))).toBe(true);
    });

    test('preserves existing behavior when settings are absent (defaults to true)', () => {
        // No setTestSettings call — no settings stored
        containerAction(client, 'other', 'take', 'monety');
        const cmds = sentCommands();
        expect(cmds[0]).toMatch(/^otworz /);
        expect(cmds[cmds.length - 1]).toMatch(/^zamknij /);
    });
});

describe('bagManager plugin container types', () => {
    let client: Client;
    let mockAdapter: jest.Mocked<ClientAdapter>;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        mockAdapter = {
            send: jest.fn(),
            output: jest.fn(),
            sendGmcp: jest.fn(),
            flushMessageBuffer: jest.fn(),
            emit: jest.fn(),
            shouldEchoCommand: jest.fn(() => true),
        };
        client = new Client(mockAdapter);
        setTestSettings({ containerOpen: false, containerClose: false });
    });

    afterEach(() => {
        unregisterContainerType('test-sockets');
        unregisterContainerType('test-chain');
    });

    function sentCommands(): string[] {
        return mockAdapter.send.mock.calls.map((call) => call[0] as string);
    }

    test('uses the fallback type bag until one is set', () => {
        registerContainerType('test-sockets', { label: 'gniazda', fallback: 'gems' });
        expect(getContainer('test-sockets')).toBe(getContainer('gems'));
        expect(getContainerForms('test-sockets')).toEqual(getContainerForms('gems'));
    });

    test('follows fallbacks through other plugin types', () => {
        registerContainerType('test-sockets', { fallback: 'gems' });
        registerContainerType('test-chain', { fallback: 'test-sockets' });
        expect(getContainer('test-chain')).toBe(getContainer('gems'));
    });

    test('rejects built-in ids and self fallback', () => {
        expect(() => registerContainerType('gems')).toThrow();
        expect(() => registerContainerType('test-sockets', { fallback: 'test-sockets' })).toThrow();
    });

    test('put and take use the resolved bag', () => {
        registerContainerType('test-sockets', { fallback: 'gems' });
        containerAction(client, 'test-sockets', 'put', 'rubin');
        expect(sentCommands()).toContain(`wloz rubin do swojego ${getContainerForms('gems')!.dopelniacz}`);
    });

    test('unknown type has no bag', () => {
        expect(getContainer('test-missing')).toBe('');
        expect(getContainerForms('test-missing')).toBeNull();
    });
});

describe('bagManager /pojemnik', () => {
    class FakeClient {
        Triggers = new Triggers(({} as unknown) as any);
        println = jest.fn();
        print = jest.fn();
        sendCommand = jest.fn();
    }

    let client: FakeClient;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        setTestSettings({ containerOpen: true, containerClose: true });
        client = new FakeClient();
    });

    function scanInventory(...lines: string[]): string {
        const aliases: { pattern: RegExp; callback: Function }[] = [];
        initBagManager((client as unknown) as any, aliases);
        aliases.find((a) => a.pattern.test('/pojemnik'))!.callback();
        lines.forEach((line) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), ''));
        return client.println.mock.calls.map(([buf]) => (buf as AnsiAwareBuffer).text).join('\n');
    }

    test('finds bags listed on the "Masz przy sobie" line', () => {
        const printed = scanInventory(
            'Na plecach nosisz prawie pusta otwarta pakowna kruczoczarna sakwe.',
            'Masz przy sobie dlugi klucz, zamkniety skorzany woreczek i otwarta ciemnoniebieska runiczna sakiewke.',
        );
        expect(printed).toContain('Ustaw sakwa jako:');
        expect(printed).toContain('Ustaw sakiewka jako:');
    });

    test('numbers several bags of the same kind, plural ones included', () => {
        const printed = scanInventory(
            'Masz przy sobie otwarta runiczna sakiewke, klucz i dwie zamkniete skorzane sakiewki.',
        );
        expect(printed).toContain('Ustaw 1. sakiewka (otwarta runiczna) jako:');
        expect(printed).toContain('Ustaw 2. sakiewka (zamkniete skorzane) jako:');
        expect(printed).toContain('Ustaw 3. sakiewka (zamkniete skorzane) jako:');
        expect(printed).not.toMatch(/Ustaw sakiewka jako/);
    });

    test('commands address the chosen bag by its ordinal', () => {
        characterStorage.set('containers', { money: '2. sakiewka', gems: 'plecak', food: 'plecak', other: 'plecak' });
        initBagManager((client as unknown) as any);
        containerAction(client as any, 'money', 'take', 'monety');
        expect(client.sendCommand.mock.calls.map(([cmd]) => cmd)).toEqual([
            'otworz 2. swoja sakiewke',
            'wez monety z 2. swojej sakiewki',
            'zamknij 2. swoja sakiewke',
        ]);
        expect(getContainer('money')).toBe('2. sakiewka');
        expect(getContainerForms('money')).toEqual({ mianownik: 'sakiewka', dopelniacz: 'sakiewki', biernik: 'sakiewke', index: 2 });
    });

    test('a bare bag name keeps the old commands', () => {
        characterStorage.set('containers', { money: 'sakiewka', gems: 'plecak', food: 'plecak', other: 'plecak' });
        initBagManager((client as unknown) as any);
        containerAction(client as any, 'money', 'put', 'monety');
        expect(client.sendCommand.mock.calls.map(([cmd]) => cmd)).toEqual([
            'otworz swoja sakiewke',
            'wloz monety do swojej sakiewki',
            'zamknij swoja sakiewke',
        ]);
    });
});

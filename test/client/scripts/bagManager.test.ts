import Client from '@client/Client';
import type { ClientAdapter } from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import { containerAction, getContainer, getContainerForms, registerContainerType, unregisterContainerType } from '@client/scripts/bagManager';
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

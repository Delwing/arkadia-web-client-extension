import Client from '@client/Client';
import type { ClientAdapter } from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import { containerAction } from '@client/scripts/bagManager';
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

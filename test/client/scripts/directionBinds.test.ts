import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage, globalStorage } from '@modules/core/storage';
import initDirectionBinds from '@client/scripts/directionBinds';

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

function press(code: string, mods: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {}) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...mods }));
}

describe('directionBinds', () => {
    let client: Client;
    let commands: string[];

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        // initDirectionBinds adds a window keydown listener and never removes it,
        // so every earlier test's listener still fires. Give each test its own
        // sink, captured by value, so only this client's walks land here.
        const sink: string[] = [];
        commands = sink;
        client.sendCommand = (async (c: string) => { sink.push(c); }) as any;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('numpad defaults', () => {
        beforeEach(() => initDirectionBinds(client));

        test.each([
            ['Numpad8', 'n'],
            ['Numpad2', 's'],
            ['Numpad4', 'w'],
            ['Numpad6', 'e'],
            ['Numpad7', 'nw'],
            ['Numpad9', 'ne'],
            ['Numpad1', 'sw'],
            ['Numpad3', 'se'],
            ['NumpadMultiply', 'u'],
            ['NumpadDivide', 'd'],
            ['Numpad5', 'zerknij'],
        ])('%s walks %s', (code, direction) => {
            press(code);

            expect(commands).toEqual([direction]);
        });

        test('an unbound key does nothing', () => {
            press('KeyQ');

            expect(commands).toEqual([]);
        });

        test('a modifier that the binding does not ask for blocks it', () => {
            press('Numpad8', { ctrlKey: true });

            expect(commands).toEqual([]);
        });
    });

    describe('the special-exit key', () => {
        beforeEach(() => initDirectionBinds(client));

        test('Numpad0 takes the first special exit', () => {
            Object.defineProperty(client.Map, 'currentRoom', {
                value: { specialExits: { 'wejdz do bramy': 1, 'wejdz do studni': 2 } },
                configurable: true,
            });

            press('Numpad0');

            expect(commands).toEqual(['wejdz do bramy']);
        });

        test('it does nothing when the room has no special exits', () => {
            Object.defineProperty(client.Map, 'currentRoom', {
                value: { specialExits: {} },
                configurable: true,
            });

            press('Numpad0');

            expect(commands).toEqual([]);
        });
    });

    describe('overrides', () => {
        test('a stored keymap replaces the default', () => {
            globalStorage.set('binds', { directions: { n: { key: 'KeyW' } } } as any);
            initDirectionBinds(client);

            press('KeyW');
            expect(commands).toEqual(['n']);

            commands.length = 0;
            press('Numpad8');
            expect(commands).toEqual([]);
        });

        test('changing the keymap at runtime is picked up', () => {
            initDirectionBinds(client);

            globalStorage.set('binds', { directions: { n: { key: 'KeyW' } } } as any);
            press('KeyW');

            expect(commands).toEqual(['n']);
        });

        test('modifiers in the override are honoured', () => {
            globalStorage.set('binds', { directions: { n: { key: 'KeyW', ctrl: true } } } as any);
            initDirectionBinds(client);

            press('KeyW');
            expect(commands).toEqual([]);

            press('KeyW', { ctrlKey: true });
            expect(commands).toEqual(['n']);
        });
    });

    describe('helper hotkeys', () => {
        beforeEach(() => initDirectionBinds(client));

        test('a dir_* helper bind walks that direction', () => {
            client.sendEvent('helperBind', 'dir_n');

            expect(commands).toContain('n');
        });

        test('a non-direction helper bind is ignored', () => {
            client.sendEvent('helperBind', 'functional');

            expect(commands).toEqual([]);
        });
    });

    test('keys are ignored while a plain text field has focus', () => {
        initDirectionBinds(client);
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();

        press('Numpad8');

        expect(commands).toEqual([]);
    });

    test('the command input still walks', () => {
        initDirectionBinds(client);
        const input = document.createElement('input');
        input.setAttribute('data-command-input', 'true');
        document.body.appendChild(input);
        input.focus();

        press('Numpad8');

        expect(commands).toEqual(['n']);
    });
});

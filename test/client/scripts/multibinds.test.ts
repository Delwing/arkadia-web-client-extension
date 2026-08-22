import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import type { StoredMultibindRecord } from '@modules/data/multibindStore';

// Drive the persisted multibinds directly rather than through IndexedDB.
let storeListeners: ((list: StoredMultibindRecord[]) => void)[] = [];
let saved: StoredMultibindRecord[] = [];
vi.mock('@modules/data/multibindStore', () => ({
    subscribe: (listener: (l: StoredMultibindRecord[]) => void) => {
        storeListeners.push(listener);
        return () => {};
    },
    replaceAll: (list: StoredMultibindRecord[]) => {
        saved = list;
        return Promise.resolve(list);
    },
}));

const initMultibinds = (await import('@client/scripts/multibinds')).default;

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

describe('multibinds', () => {
    let client: Client;
    let printed: string[];
    let commands: string[];
    let offCommand: () => void;

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    function inRoom(id: number | null) {
        Object.defineProperty(client.Map, 'currentRoom', {
            value: id === null ? undefined : { id, userData: {} },
            configurable: true,
        });
    }

    /** Hand the script its persisted state, which also marks it initialised. */
    function loadStored(list: StoredMultibindRecord[]) {
        storeListeners.forEach(l => l(list));
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        storeListeners = [];
        saved = [];
        printed = [];
        commands = [];
        client = createClient(printed);
        const sink = commands;
        offCommand = client.on('command', (c: string) => { sink.push(c); });
        initMultibinds(client, client.aliases);
        inRoom(100);
        loadStored([]);
        printed.length = 0;
    });

    afterEach(() => {
        offCommand();
        document.body.innerHTML = '';
    });

    describe('creating binds', () => {
        test('/mbind N action stores an action for the current room', async () => {
            await client.sendCommand('/mbind 1 zaloz plaszcz');

            expect(saved).toEqual([{ roomId: 100, index: 1, action: 'zaloz plaszcz' }]);
        });

        test('/mbind+ takes the next free slot', async () => {
            await client.sendCommand('/mbind 1 pierwszy');
            await client.sendCommand('/mbind+ drugi');

            expect(saved).toContainEqual({ roomId: 100, index: 2, action: 'drugi' });
        });

        test('an index outside 1..4 is refused', async () => {
            await client.sendCommand('/mbind 9 cos');

            expect(output()).toContain('Numer binda musi byc pomiedzy 1, a 4.');
        });

        test('nothing can be bound without a location', async () => {
            inRoom(null);

            await client.sendCommand('/mbind 1 cos');

            expect(output()).toContain('brak aktualnej lokacji');
        });

        test('a full room refuses more binds', async () => {
            for (let i = 1; i <= 4; i++) await client.sendCommand(`/mbind ${i} akcja${i}`);

            await client.sendCommand('/mbind+ jeszcze');

            expect(output()).toContain('maksymalna');
        });
    });

    describe('clearing binds', () => {
        test('/mbind- clears the whole room', async () => {
            await client.sendCommand('/mbind 1 pierwszy');
            await client.sendCommand('/mbind 2 drugi');

            await client.sendCommand('/mbind-');

            expect(saved).toEqual([]);
        });

        test('/mbind- N clears just that slot', async () => {
            await client.sendCommand('/mbind 1 pierwszy');
            await client.sendCommand('/mbind 2 drugi');

            await client.sendCommand('/mbind- 1');

            expect(saved).toEqual([{ roomId: 100, index: 2, action: 'drugi' }]);
        });

        test('/mbind- with a bad index is refused', async () => {
            await client.sendCommand('/mbind- 9');

            expect(output()).toContain('Numer binda musi byc pomiedzy 1, a 4.');
        });
    });

    describe('listing binds', () => {
        test('/mbind shows the current room', async () => {
            await client.sendCommand('/mbind 1 zaloz plaszcz');
            output();

            await client.sendCommand('/mbind');

            expect(output()).toContain('zaloz plaszcz');
        });

        test('/mbind <roomId> shows another room', async () => {
            loadStored([{ roomId: 200, index: 1, action: 'akcja w innym pokoju' }]);
            output();

            await client.sendCommand('/mbind 200');

            expect(output()).toContain('akcja w innym pokoju');
        });

        test('/mbind without a location says so', async () => {
            inRoom(null);

            await client.sendCommand('/mbind');

            expect(output()).toContain('Brak aktualnej lokacji.');
        });
    });

    describe('running binds', () => {
        test('the bound key sends the action', async () => {
            await client.sendCommand('/mbind 1 zaloz plaszcz');
            commands.length = 0;

            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', altKey: true, bubbles: true }));

            expect(commands).toContain('zaloz plaszcz');
        });

        test('a key repeat is ignored', async () => {
            await client.sendCommand('/mbind 1 zaloz plaszcz');
            commands.length = 0;

            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', altKey: true, repeat: true, bubbles: true }));

            expect(commands).not.toContain('zaloz plaszcz');
        });

        test('the drinkable helper bind drinks', () => {
            client.sendEvent('helperBind', 'drinkable');

            expect(commands).toContain('napij sie do syta wody');
        });

        test('the room helper bind runs the room action', () => {
            const executeBind = vi.spyOn(client.Map, 'executeBind').mockImplementation(() => {});
            Object.defineProperty(client.Map, 'currentRoom', {
                value: { id: 100, userData: { bind: 'otworz brame' } },
                configurable: true,
            });

            client.sendEvent('helperBind', 'roomBind');

            expect(executeBind).toHaveBeenCalledWith('otworz brame');
        });
    });

    describe('publishing to the UI', () => {
        test('entering a room announces its binds', () => {
            loadStored([{ roomId: 300, index: 1, action: 'akcja' }]);
            let payload: any = null;
            const off = client.on('multibinds', (p: any) => { payload = p; });

            client.sendEvent('enterLocation', { id: 300 } as any);
            off();

            expect(payload.list.map((e: any) => e.action)).toContain('akcja');
        });

        test('a room with no binds announces an empty list', () => {
            let payload: any = null;
            const off = client.on('multibinds', (p: any) => { payload = p; });

            client.sendEvent('enterLocation', { id: 999 } as any);
            off();

            expect(payload.list).toEqual([]);
        });
    });
});

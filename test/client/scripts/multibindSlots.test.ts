import { vi } from 'vitest';

const store = vi.hoisted(() => ({
    listeners: [] as ((list: unknown[]) => void)[],
    replaceAll: vi.fn((_list: unknown[]) => Promise.resolve()),
}));

vi.mock('@modules/data/multibindStore', () => ({
    replaceAll: store.replaceAll,
    subscribe: (cb: (list: unknown[]) => void) => {
        store.listeners.push(cb);
        cb([]);
        return () => {};
    },
}));

import initMultibinds from '@client/scripts/multibinds';
import { globalStorage } from '@modules/core/storage';
import { defaultBinds } from '@modules/core/keymapStorage';
import type { Bind } from '@modules/core/keymapTypes';

/**
 * The keymap decides how many multibind slots there are and which key each
 * has; a slot without a key still shows on the bar, without a key hint.
 */

interface Chip { index: number; action: string; label: string }

function setMultibindKeys(multibinds: Bind[]) {
    globalStorage.set('binds', { ...structuredClone(defaultBinds), multibinds });
}

function createClient() {
    const handlers = new Map<string, ((detail: any) => void)[]>();
    const events: Chip[][] = [];
    return {
        Map: { currentRoom: { id: 1 } as any, executeBind: vi.fn() },
        println: vi.fn(),
        sendCommand: vi.fn(),
        on(event: string, cb: (detail: any) => void) {
            handlers.set(event, [...(handlers.get(event) ?? []), cb]);
        },
        emit(event: string, detail?: any) {
            (handlers.get(event) ?? []).forEach(cb => cb(detail));
        },
        sendEvent(event: string, payload: any) {
            if (event === 'multibinds') events.push(payload.list as Chip[]);
        },
        events,
    };
}

const aliases: { pattern: RegExp; callback: Function }[] = [];
let client: ReturnType<typeof createClient>;

function run(command: string) {
    for (const alias of aliases) {
        const match = command.match(alias.pattern);
        if (match) return alias.callback(match);
    }
}

beforeAll(() => {
    setMultibindKeys(defaultBinds.multibinds!);
    client = createClient();
    initMultibinds(client as any, aliases);
});

beforeEach(() => {
    setMultibindKeys([
        { key: 'Digit1', alt: true },
        { key: 'Digit2', alt: true },
        { key: 'Digit3', alt: true },
        { key: 'Digit4', alt: true },
        { key: 'Digit5', alt: true },
        { key: '' },
    ]);
    store.listeners.at(-1)!([
        { roomId: 1, index: 5, action: 'otworz skrzynie' },
        { roomId: 1, index: 6, action: 'pociagnij dzwignie' },
    ]);
    client.sendCommand.mockClear();
    client.println.mockClear();
});

test('every slot shows on the bar, one without a key without a hint', () => {
    const list = client.events.at(-1)!;
    expect(list.find(c => c.index === 5)).toEqual({ index: 5, action: 'otworz skrzynie', label: 'ALT+5' });
    expect(list.find(c => c.index === 6)).toEqual({ index: 6, action: 'pociagnij dzwignie', label: '' });
});

test('an added slot runs on its own key', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit5', key: '5', altKey: true }));
    expect(client.sendCommand).toHaveBeenCalledWith('otworz skrzynie');
});

test('a helper hotkey runs any slot', () => {
    client.emit('helperBind', 'multibind6');
    expect(client.sendCommand).toHaveBeenCalledWith('pociagnij dzwignie');
});

test('/mbind takes any slot the keymap has, and no more', () => {
    store.replaceAll.mockClear();
    run('/mbind 6 zerknij');
    expect(store.replaceAll).toHaveBeenCalled();
    store.replaceAll.mockClear();
    run('/mbind 7 zerknij');
    expect(store.replaceAll).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledWith('[multibinds] Numer binda musi byc pomiedzy 1, a 6.');
});

test('saved binds past the slots stay, with no key', () => {
    setMultibindKeys(defaultBinds.multibinds!);
    const list = client.events.at(-1)!;
    expect(list.find(c => c.index === 5)).toEqual({ index: 5, action: 'otworz skrzynie', label: '' });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit5', key: '5', altKey: true }));
    expect(client.sendCommand).not.toHaveBeenCalled();
});

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
import { temporaryMultibinds } from '@client/scripts/temporaryMultibinds';

interface Chip {
    index: number;
    action: string;
    label: string;
    name?: string;
    temporary?: boolean;
    highlight?: boolean;
}

function createClient() {
    const handlers = new Map<string, ((detail: any) => void)[]>();
    const events: Chip[][] = [];
    return {
        Map: {
            currentRoom: null as any,
            executeBind: vi.fn(),
        },
        println: vi.fn(),
        sendCommand: vi.fn(),
        on(event: string, cb: (detail: any) => void) {
            const list = handlers.get(event) ?? [];
            list.push(cb);
            handlers.set(event, list);
        },
        emit(event: string, detail?: any) {
            (handlers.get(event) ?? []).forEach(cb => cb(detail));
        },
        sendEvent(event: string, payload: any) {
            if (event === 'multibinds') {
                events.push(payload.list as Chip[]);
            }
        },
        events,
    };
}

type TestClient = ReturnType<typeof createClient>;

function setup(saved: { roomId: number; index: number; action: string }[] = []) {
    const client = createClient();
    initMultibinds(client as any);
    // Push saved binds through the (mocked) store the way a load would
    store.listeners.at(-1)!(saved);
    return client;
}

function enter(client: TestClient, room: any) {
    client.Map.currentRoom = room;
    client.emit('enterLocation', { id: room?.id ?? null });
    return last(client);
}

function last(client: TestClient): Chip[] {
    return client.events.at(-1) ?? [];
}

function pressAlt(digit: number) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: `Digit${digit}`, key: String(digit), altKey: true }));
}

describe('temporary multibinds', () => {
    beforeEach(() => {
        temporaryMultibinds.clear();
        store.listeners.length = 0;
        store.replaceAll.mockClear();
    });

    afterEach(() => {
        temporaryMultibinds.clear();
    });

    test('takes the lowest slot not used by a saved bind', () => {
        const client = setup([
            { roomId: 10, index: 1, action: 'zerknij' },
            { roomId: 10, index: 3, action: 'wesprzyj' },
        ]);
        enter(client, { id: 10, userData: {} });

        temporaryMultibinds.add({ action: 'otworz skrzynie', label: 'Skrzynia' });
        temporaryMultibinds.add({ action: 'wez monety' });

        expect(last(client)).toEqual([
            { index: 1, action: 'zerknij', label: 'ALT+1' },
            { index: 2, action: 'otworz skrzynie', label: 'ALT+2', name: 'Skrzynia', temporary: true },
            { index: 3, action: 'wesprzyj', label: 'ALT+3' },
            { index: 4, action: 'wez monety', label: 'ALT+4', temporary: true },
        ]);
    });

    test('reuses a saved bind with the same action and highlights it', () => {
        const client = setup([{ roomId: 10, index: 2, action: 'otworz skrzynie' }]);
        enter(client, { id: 10, userData: {} });

        temporaryMultibinds.add({ action: '  otworz skrzynie ', highlight: true });

        expect(last(client)).toEqual([
            { index: 2, action: 'otworz skrzynie', label: 'ALT+2', highlight: true },
        ]);
    });

    test('a second temporary with the same action reuses the first slot', () => {
        const client = setup();
        enter(client, { id: 10, userData: {} });

        temporaryMultibinds.add({ action: 'otworz skrzynie' });
        temporaryMultibinds.add({ action: 'otworz skrzynie', highlight: true });

        expect(last(client)).toEqual([
            { index: 1, action: 'otworz skrzynie', label: 'ALT+1', temporary: true, highlight: true },
        ]);
    });

    test('is not shown nor runnable when the bar is full', () => {
        const client = setup([1, 2, 3, 4].map(index => ({ roomId: 10, index, action: `akcja ${index}` })));
        enter(client, { id: 10, userData: {} });

        temporaryMultibinds.add({ action: 'nie zmieszcze sie' });

        const list = last(client);
        expect(list).toHaveLength(4);
        expect(list.some(chip => chip.temporary)).toBe(false);

        pressAlt(1);
        expect(client.sendCommand).toHaveBeenCalledWith('akcja 1');
        expect(client.sendCommand).not.toHaveBeenCalledWith('nie zmieszcze sie');
    });

    test('roomId limits the bind to that room; without it the bind shows everywhere', () => {
        const client = setup();
        enter(client, { id: 10, userData: {} });

        temporaryMultibinds.add({ action: 'tylko tutaj', roomId: 20 });
        temporaryMultibinds.add({ action: 'wszedzie' });

        expect(last(client).map(chip => chip.action)).toEqual(['wszedzie']);

        expect(enter(client, { id: 20, userData: {} })).toEqual([
            { index: 1, action: 'tylko tutaj', label: 'ALT+1', temporary: true },
            { index: 2, action: 'wszedzie', label: 'ALT+2', temporary: true },
        ]);

        // Unknown room: only binds without roomId
        client.Map.currentRoom = null;
        client.emit('enterLocation', { id: undefined });
        expect(last(client).map(chip => chip.action)).toEqual(['wszedzie']);
    });

    test('update and remove refresh the bar; remove is idempotent', () => {
        const client = setup();
        enter(client, { id: 10, userData: {} });

        const handle = temporaryMultibinds.add({ action: 'krok pierwszy' });
        const before = client.events.length;

        handle.update({ action: 'krok drugi', label: 'Drugi', highlight: true });
        expect(client.events.length).toBe(before + 1);
        expect(last(client)).toEqual([
            { index: 1, action: 'krok drugi', label: 'ALT+1', name: 'Drugi', temporary: true, highlight: true },
        ]);

        handle.remove();
        expect(client.events.length).toBe(before + 2);
        expect(last(client)).toEqual([]);

        handle.remove();
        handle.update({ action: 'po usunieciu' });
        expect(client.events.length).toBe(before + 2);
        expect(temporaryMultibinds.list()).toEqual([]);
    });

    test('pressing the multibind key runs the temporary action', () => {
        const client = setup([{ roomId: 10, index: 1, action: 'zerknij' }]);
        enter(client, { id: 10, userData: {} });

        temporaryMultibinds.add({ action: 'otworz skrzynie' });
        pressAlt(2);

        expect(client.sendCommand).toHaveBeenCalledWith('otworz skrzynie');
    });

    test('runs in an unknown room too', () => {
        const client = setup();
        temporaryMultibinds.add({ action: 'bez lokacji' });
        pressAlt(1);

        expect(client.sendCommand).toHaveBeenCalledWith('bez lokacji');
    });

    test('never persists temporary binds', () => {
        const client = setup();
        enter(client, { id: 10, userData: {} });

        const handle = temporaryMultibinds.add({ action: 'otworz skrzynie' });
        handle.update({ action: 'zamknij skrzynie' });
        handle.remove();

        expect(store.replaceAll).not.toHaveBeenCalled();
    });
});

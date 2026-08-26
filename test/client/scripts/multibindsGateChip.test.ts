import { vi } from 'vitest';

vi.mock('@modules/data/multibindStore', () => ({
    replaceAll: vi.fn(() => Promise.resolve()),
    subscribe: (cb: (list: unknown[]) => void) => {
        cb([]);
        return () => {};
    },
}));

import initMultibinds from '@client/scripts/multibinds';

interface Chip {
    index: number;
    action: string;
    label: string;
}

const GATE_INDEX = 7;

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

describe('multibinds gate chip', () => {
    function enter(client: ReturnType<typeof createClient>, room: any) {
        client.Map.currentRoom = room;
        client.emit('enterLocation', { id: room?.id ?? null });
        return client.events.at(-1) ?? [];
    }

    function gateChip(list: Chip[]) {
        return list.find(chip => chip.index === GATE_INDEX);
    }

    test('shows the gate chip when entering a gate location', () => {
        const client = createClient();
        initMultibinds(client as any);

        const list = enter(client, { id: 1, userData: { gate: 'zapukaj w brame' } });

        expect(gateChip(list)).toEqual({
            index: GATE_INDEX,
            action: 'zapukaj w brame',
            label: 'ALT+B',
        });
    });

    test('keeps the gate chip when crossing from one gate location to another', () => {
        const client = createClient();
        initMultibinds(client as any);

        enter(client, { id: 1, userData: { gate: 'uderz we wrota' } });
        const afterCrossing = enter(client, { id: 2, userData: { gate: 'uderz we wrota' } });

        // The just-crossed rule applies to the functional bind, not the chip.
        expect(gateChip(afterCrossing)).toBeDefined();
    });

    test('shows the gate chip again after leaving the gate area', () => {
        const client = createClient();
        initMultibinds(client as any);

        enter(client, { id: 1, userData: { gate: 'uderz we wrota' } });
        enter(client, { id: 2, userData: { gate: 'uderz we wrota' } });
        enter(client, { id: 3, userData: {} });
        const backAtGate = enter(client, { id: 2, userData: { gate: 'uderz we wrota' } });

        expect(gateChip(backAtGate)).toBeDefined();
    });

    test('no gate chip in a plain location', () => {
        const client = createClient();
        initMultibinds(client as any);

        const list = enter(client, { id: 5, userData: {} });

        expect(gateChip(list)).toBeUndefined();
    });
});

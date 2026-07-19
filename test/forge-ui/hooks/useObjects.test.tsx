// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import eventBus from '@modules/core/eventBus';
import { useObjects, type GameObject } from '../../../forge-ui/hooks/useObjects';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeClient(initial: GameObject[]) {
    let objects = initial;
    return {
        setObjects: (next: GameObject[]) => { objects = next; },
        ObjectManager: {
            getObjectsOnLocation: () => objects,
        },
    } as unknown as { ObjectManager: { getObjectsOnLocation: () => GameObject[] }; setObjects: (n: GameObject[]) => void };
}

describe('useObjects', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    function renderProbe(client: ReturnType<typeof makeClient>, onValue: (v: GameObject[]) => void) {
        function Probe() {
            const objects = useObjects(client as never);
            onValue(objects);
            return null;
        }
        act(() => {
            root.render(<Probe />);
        });
    }

    it('returns the initial objects on the current location', () => {
        const client = makeClient([{ num: 1, shortcut: 'a' }]);
        let last: GameObject[] = [];
        renderProbe(client, v => { last = v; });

        expect(last).toEqual([{ num: 1, shortcut: 'a' }]);
    });

    it.each([
        'gmcp.objects.nums',
        'gmcp.objects.data',
        'gmcp.char.state',
    ] as const)('refreshes from ObjectManager on %s', (event) => {
        const client = makeClient([{ num: 1, shortcut: 'a' }]);
        let last: GameObject[] = [];
        renderProbe(client, v => { last = v; });

        client.setObjects([{ num: 2, shortcut: 'b' }, { num: 3, shortcut: 'c' }]);
        act(() => {
            eventBus.emit(event as never);
        });

        expect(last).toEqual([{ num: 2, shortcut: 'b' }, { num: 3, shortcut: 'c' }]);
    });

    it('stops refreshing after unmount', () => {
        const client = makeClient([{ num: 1, shortcut: 'a' }]);
        let last: GameObject[] = [];
        renderProbe(client, v => { last = v; });

        act(() => root.unmount());
        client.setObjects([{ num: 9, shortcut: 'z' }]);
        act(() => {
            eventBus.emit('gmcp.objects.nums' as never);
        });

        // No re-render happened, so the last captured value is still the initial one.
        expect(last).toEqual([{ num: 1, shortcut: 'a' }]);
    });
});

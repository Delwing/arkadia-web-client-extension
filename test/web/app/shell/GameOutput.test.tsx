import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const client = vi.hoisted(() => {
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    return {
        on: (event: string, fn: (...args: any[]) => void) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)!.add(fn);
        },
        off: (event: string, fn: (...args: any[]) => void) => { listeners.get(event)?.delete(fn); },
        emit: (event: string, ...args: any[]) => { for (const fn of [...(listeners.get(event) ?? [])]) fn(...args); },
        count: (event: string) => listeners.get(event)?.size ?? 0,
    };
});
vi.mock('@web/MudClient.ts', () => ({ default: client }));
vi.mock('@web/outputContextMenu.tsx', () => ({ setupOutputContextMenu: vi.fn() }));
vi.mock('@web/outputSearch/installOutputSearch.ts', () => ({ installOutputSearch: vi.fn() }));

import { GameOutput } from '@web/app/shell/GameOutput';
import { bufferOutputUntilMounted, getOutputHandler } from '@web/app/shell/outputHandle';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lines = () => [...document.querySelectorAll('#main_text_output_msg_wrapper > .output_msg .output_msg_content')].map(el => el.textContent);

describe('GameOutput', () => {
    let container: HTMLElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('shows what was printed before it mounted, in order, then live output, above the scrollback pane', () => {
        bufferOutputUntilMounted(client);
        client.emit('message', 'pierwsza', 'text', 1);
        client.emit('message', 'druga', 'text', 2);

        act(() => root.render(<GameOutput toasts={null} />));
        expect(lines()).toEqual(['pierwsza', 'druga']);
        // The buffer let go of the client; only the engine listens now.
        expect(client.count('message')).toBe(1);

        client.emit('message', 'trzecia', 'text', 3);
        expect(lines()).toEqual(['pierwsza', 'druga', 'trzecia']);

        const wrapper = document.getElementById('main_text_output_msg_wrapper')!;
        expect(wrapper.firstElementChild!.id).toBe('notification-center');
        expect(wrapper.lastElementChild!.id).toBe('split-bottom');
        expect(getOutputHandler()).not.toBeNull();
    });

    it('lets go of the client when it unmounts', () => {
        act(() => root.render(<GameOutput toasts={null} />));
        act(() => root.unmount());
        root = createRoot(container);
        expect(client.count('message')).toBe(0);
        expect(getOutputHandler()).toBeNull();
    });

    it('renders the toasts inside the notification strip', () => {
        const snapshot = { toasts: [], expanded: false };
        const store = { subscribe: () => () => undefined, getSnapshot: () => snapshot, refresh: vi.fn() };
        act(() => root.render(<GameOutput toasts={{ store: store as any, runAction: vi.fn() }} />));
        const strip = document.getElementById('notification-center')!;
        expect(strip.hasAttribute('data-output-keep')).toBe(true);
        expect(strip.style.getPropertyValue('--toast-viewport-h')).toMatch(/px$/);
    });
});

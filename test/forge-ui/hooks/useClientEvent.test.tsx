// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import eventBus from '@modules/core/eventBus';
import { useClientEvent } from '../../../forge-ui/hooks/useClientEvent';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useClientEvent', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    function renderProbe(event: 'client.connect' | 'client.disconnect', onFire: (...args: unknown[]) => void) {
        function Probe() {
            useClientEvent(event as never, onFire as never);
            return null;
        }
        act(() => {
            root.render(<Probe />);
        });
    }

    it('invokes the handler when the subscribed event fires', () => {
        const calls: unknown[][] = [];
        renderProbe('client.connect', (...args) => calls.push(args));

        act(() => {
            eventBus.emit('client.connect');
        });

        expect(calls.length).toBe(1);
    });

    it('always calls the latest handler even without re-subscribing (ref indirection)', () => {
        let seen = 'first';
        function Probe({ label }: { label: string }) {
            useClientEvent('client.connect' as never, (() => {
                seen = label;
            }) as never);
            return null;
        }

        act(() => root.render(<Probe label="first" />));
        act(() => root.render(<Probe label="second" />));
        act(() => {
            eventBus.emit('client.connect');
        });

        expect(seen).toBe('second');
    });

    it('unsubscribes on unmount so the handler stops firing', () => {
        const calls: unknown[][] = [];
        renderProbe('client.connect', (...args) => calls.push(args));

        act(() => root.unmount());
        act(() => {
            eventBus.emit('client.connect');
        });

        expect(calls.length).toBe(0);
    });

    it('re-subscribes when the event name changes', () => {
        const connectCalls: unknown[][] = [];
        const disconnectCalls: unknown[][] = [];
        function Probe({ event }: { event: 'client.connect' | 'client.disconnect' }) {
            useClientEvent(event as never, ((...args: unknown[]) => {
                (event === 'client.connect' ? connectCalls : disconnectCalls).push(args);
            }) as never);
            return null;
        }

        act(() => root.render(<Probe event="client.connect" />));
        act(() => root.render(<Probe event="client.disconnect" />));

        act(() => {
            eventBus.emit('client.connect');
            eventBus.emit('client.disconnect');
        });

        // Switched away from 'client.connect' before this emit, so it should not fire.
        expect(connectCalls.length).toBe(0);
        expect(disconnectCalls.length).toBe(1);
    });
});

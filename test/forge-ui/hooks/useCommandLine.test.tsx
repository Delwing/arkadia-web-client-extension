// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import eventBus from '@modules/core/eventBus';
import { ClientProvider } from '../../../forge-ui/client/ClientContext';
import { useCommandLine } from '../../../forge-ui/hooks/useCommandLine';
import type Client from '@client/Client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeFakeClient(): Client {
    return {
        sendCommand: jest.fn(),
        commandLineSuggestions: [],
    } as unknown as Client;
}

describe('useCommandLine', () => {
    let container: HTMLDivElement;
    let root: Root;
    let seenPasswordMode: boolean[];

    beforeEach(() => {
        localStorage.clear();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        seenPasswordMode = [];
    });

    function renderProbe(client: Client) {
        function Probe() {
            const inputRef = useRef<HTMLTextAreaElement>(null);
            const passwordRef = useRef<HTMLInputElement>(null);
            const { passwordMode } = useCommandLine({ inputRef, passwordRef });
            seenPasswordMode.push(passwordMode);
            return (
                <div>
                    <textarea ref={inputRef} id="alt-input" />
                    <input ref={passwordRef} type="password" />
                </div>
            );
        }
        act(() => {
            root.render(
                <ClientProvider value={client}>
                    <Probe />
                </ClientProvider>,
            );
        });
    }

    it('starts in non-password mode', () => {
        renderProbe(makeFakeClient());
        expect(seenPasswordMode.at(-1)).toBe(false);
    });

    it('switches to password mode when telnet.echo reports server echoing', () => {
        renderProbe(makeFakeClient());

        act(() => {
            eventBus.emit('telnet.echo', true);
        });

        expect(seenPasswordMode.at(-1)).toBe(true);
    });

    it('switches back out of password mode when telnet.echo reports off', () => {
        renderProbe(makeFakeClient());

        act(() => {
            eventBus.emit('telnet.echo', true);
        });
        act(() => {
            eventBus.emit('telnet.echo', false);
        });

        expect(seenPasswordMode.at(-1)).toBe(false);
    });

    it('focuses the password field once password mode turns on', () => {
        renderProbe(makeFakeClient());
        const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;

        act(() => {
            eventBus.emit('telnet.echo', true);
        });

        expect(document.activeElement).toBe(passwordInput);
    });

    it('stops reacting to telnet.echo after unmount', () => {
        renderProbe(makeFakeClient());
        act(() => root.unmount());

        // Should not throw even though the component tree is gone.
        expect(() => {
            act(() => {
                eventBus.emit('telnet.echo', true);
            });
        }).not.toThrow();
    });
});

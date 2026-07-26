// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ClientProvider, useClient } from '../../../forge-ui/client/ClientContext';
import type Client from '@client/Client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ClientContext', () => {
    it('throws when useClient is called without a ClientProvider', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        let caught: unknown;
        function Probe() {
            try {
                useClient();
            } catch (e) {
                caught = e;
            }
            return null;
        }

        // React logs the render error to console; that's expected here, not a test failure.
        act(() => root.render(<Probe />));

        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toMatch(/ClientProvider/);
    });

    it('returns the provided client instance', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const fakeClient = { id: 'fake' } as unknown as Client;

        let seen: Client | undefined;
        function Probe() {
            seen = useClient();
            return null;
        }

        act(() => {
            root.render(
                <ClientProvider value={fakeClient}>
                    <Probe />
                </ClientProvider>,
            );
        });

        expect(seen).toBe(fakeClient);
    });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import eventBus from '@modules/core/eventBus';
import { ConnectionStatus } from '@web-ui/components/panels/ConnectionStatus';

/*
 * The footer's connection readout: round-trip time, and the session proxy's clock
 * drift. Off by default (see defaultFooterComponents) because both are diagnostics —
 * the drift one exists so a proxy with a wrong clock is something you can look at
 * rather than something you infer from timers reading oddly.
 */
describe('ConnectionStatus readout', () => {
    let container: HTMLElement;
    let root: Root;

    beforeEach(() => {
        eventBus.clear();
        document.body.innerHTML = '<span id="connection-status"></span>';
        container = document.getElementById('connection-status')!;
        act(() => {
            root = createRoot(document.createElement('div'));
            root.render(<ConnectionStatus />);
        });
    });

    afterEach(() => {
        act(() => root.unmount());
        eventBus.clear();
    });

    test('stays empty until something is measured', () => {
        expect(container.textContent).toBe('');
        expect(container.style.display).toBe('none');
    });

    test('shows the round-trip time', () => {
        act(() => {
            eventBus.emit('ping', 42.4);
        });

        expect(container.textContent).toContain('Ping:');
        expect(container.textContent).toContain('42ms');
    });

    test('shows the proxy drift, signed, so its direction is readable', () => {
        act(() => {
            eventBus.emit('proxy.clockOffset', 5_000);
        });

        expect(container.textContent).toContain('+5.0s');

        act(() => {
            eventBus.emit('proxy.clockOffset', -1_500);
        });

        expect(container.textContent).toContain('-1.5s');
    });

    test('shows both once both are known', () => {
        act(() => {
            eventBus.emit('ping', 120);
            eventBus.emit('proxy.clockOffset', 250);
        });

        expect(container.textContent).toContain('120ms');
        expect(container.textContent).toContain('+0.3s');
    });

    test('goes quiet again when the connection drops', () => {
        act(() => {
            eventBus.emit('ping', 42);
        });

        // PingTracker.stop() reports null on disconnect.
        act(() => {
            eventBus.emit('ping', null);
        });

        expect(container.textContent).toBe('');
        expect(container.style.display).toBe('none');
    });
});

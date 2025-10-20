jest.mock('mudlet-map-renderer', () => ({
    MapReader: class {},
    PathFinder: class {},
    Renderer: class {},
    Settings: {},
}));

jest.mock('@client/src/main', () => ({
    registerScripts: jest.fn(),
}));

jest.mock('@client/src/Client', () => {
    const eventBus = jest.requireActual('@client/src/eventBus').default;

    return class MockClient {
        eventTarget = eventBus;
        clientAdapter: any;
        port: any;

        constructor(clientAdapter: any, port: any) {
            this.clientAdapter = clientAdapter;
            this.port = port;
        }

        connect(port: any) {
            this.port = port;
            this.eventTarget.dispatchEvent(new CustomEvent('port-connected'));
        }

        addEventListener(event: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
            this.eventTarget.addEventListener(event, listener, options);
        }

        removeEventListener(event: string, listener: EventListenerOrEventListenerObject | null) {
            this.eventTarget.removeEventListener(event, listener);
        }

        sendEvent(type: string, payload?: any) {
            this.eventTarget.dispatchEvent(new CustomEvent(type, { detail: payload }));
        }

        sendCommand(command: string, echo: boolean = true, options?: any) {
            this.eventTarget.dispatchEvent(new CustomEvent('command', { detail: command }));
            this.clientAdapter?.send?.(command, echo, options);
        }
    };
});

import arkadiaClient from '../../src/ArkadiaClient';
import { getCommandDispatcher, getEventHub } from '../../src/runtime/clientProvider';
import { initRuntime, resetRuntimeForTests } from '../../src/runtime/compositionRoot';

describe('runtime composition', () => {
    beforeEach(() => {
        resetRuntimeForTests();
    });

    test('initRuntime provides the client through the provider', async () => {
        const runtime = await initRuntime({ enableSessionLogger: false });

        expect(runtime.client).toBeDefined();
        expect(getEventHub()).toBe(runtime.eventHub);
    });

    test('transport events flow through the exported event hub', async () => {
        await initRuntime({ enableSessionLogger: false });

        const eventHub = getEventHub();
        const handler = jest.fn();
        eventHub.addEventListener('gmcp.room.info', (event) => {
            handler((event as CustomEvent).detail);
        }, { once: true });

        const payload = { room: { id: 123 } };
        arkadiaClient.emit('gmcp.room.info', payload);

        expect(handler).toHaveBeenCalledWith(payload);
    });

    test('command dispatcher delegates to client sendCommand', async () => {
        await initRuntime({ enableSessionLogger: false });

        const eventHub = getEventHub();
        const handler = jest.fn();
        eventHub.addEventListener('command', (event) => {
            handler((event as CustomEvent).detail);
        }, { once: true });

        const dispatcher = getCommandDispatcher();
        const sendSpy = jest.spyOn(arkadiaClient, 'send').mockImplementation(() => undefined);

        dispatcher.sendCommand('test-command');

        expect(handler).toHaveBeenCalledWith('test-command');
        expect(sendSpy).toHaveBeenCalledWith('test-command', true, undefined);

        sendSpy.mockRestore();
    });
});

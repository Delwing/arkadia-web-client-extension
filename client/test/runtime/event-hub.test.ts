import eventBus from "../../src/eventBus";
import LegacyEventHub from "../../src/runtime/event-hub/legacy";

describe('LegacyEventHub', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('publishes events to both eventBus subscribers and native listeners', () => {
        const hub = new LegacyEventHub();
        const payload = { text: 'hello' };
        const busListener = jest.fn();
        const nativeListener = jest.fn();

        eventBus.on('notify', busListener);
        window.addEventListener('notify', nativeListener as EventListener);

        try {
            hub.publish('notify', payload);

            expect(busListener).toHaveBeenCalledTimes(1);
            expect(busListener).toHaveBeenCalledWith(payload);

            expect(nativeListener).toHaveBeenCalledTimes(1);
            const event = nativeListener.mock.calls[0][0] as CustomEvent;
            expect(event.detail).toEqual(payload);
        } finally {
            eventBus.off('notify', busListener);
            window.removeEventListener('notify', nativeListener as EventListener);
        }
    });

    it('unsubscribes handlers when cleanup is invoked', () => {
        const hub = new LegacyEventHub();
        const handler = jest.fn();

        const unsubscribe = hub.subscribe('notify', handler);
        unsubscribe();

        hub.publish('notify', { text: 'bye' });
        expect(handler).not.toHaveBeenCalled();
    });
});

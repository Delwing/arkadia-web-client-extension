import { useEffect, useRef } from 'react';
import eventBus, { type ClientEvents, type EventArgs, type EventListener } from '@modules/core/eventBus';

/**
 * Subscribe to an eventBus event for the component's lifetime.
 *
 * Fully typed off the shared `ClientEvents` map: the event name is constrained
 * to a known key and the handler's arguments are inferred from that event's
 * payload — the same guarantees the client itself gets, with no cast over the
 * bus.
 *
 * The handler is kept in a ref and invoked indirectly, so passing a fresh inline
 * closure each render does not churn the subscription — we register once per
 * event name and always call the latest handler. `eventBus.on` returns its own
 * unsubscribe, which we use for teardown.
 */
export function useClientEvent<K extends keyof ClientEvents>(
    event: K,
    handler: EventListener<ClientEvents[K]>,
): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const off = eventBus.on(event, (...args: EventArgs<ClientEvents[K]>) => {
            handlerRef.current(...args);
        });
        return off;
    }, [event]);
}

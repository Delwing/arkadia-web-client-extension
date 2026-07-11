import { useEffect, useRef } from 'react';
import eventBus from '@modules/core/eventBus';

/**
 * Subscribe to an eventBus event for the component's lifetime.
 *
 * The handler is kept in a ref and invoked indirectly, so passing a fresh inline
 * closure each render does not churn the subscription — we register once per
 * event name and always call the latest handler. `eventBus.on` returns its own
 * unsubscribe, which we use for teardown.
 */
export function useClientEvent(
    event: string,
    handler: (...args: unknown[]) => void,
): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const off = (eventBus as unknown as {
            on: (e: string, cb: (...args: unknown[]) => void) => () => void;
        }).on(event, (...args) => handlerRef.current(...args));
        return off;
    }, [event]);
}

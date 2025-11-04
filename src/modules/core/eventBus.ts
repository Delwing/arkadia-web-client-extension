import type { ClientEvents } from "@shared/events";

export type { ClientEvents, KnownEvents, KnowledgeReportAction, SendCommandEvent } from "@shared/events";

type Params<T> = [T] extends [void]
    ? []
    : [T] extends [any[]]
        ? T
        : [T];
type Handler<T> = (...args: Params<T>) => void;
type ListenerEntry<T> = {
    handler: Handler<T>;
    once: boolean;
    cleanup?: () => void;
};

// Local options type to avoid coupling to DOM typings.
type EventOptions = {
    once?: boolean;
    signal?: AbortSignal;
};

class EventBus<Events extends Record<PropertyKey, any>> {
    private listeners = new Map<PropertyKey, ListenerEntry<any>[]>();

    /**
     * Register a listener. Returns an unsubscribe function.
     */
    on<K extends keyof Events>(
        event: K,
        listener: Handler<Events[K]>,
        options?: EventOptions | boolean
    ): () => void {
        const key = event as unknown as PropertyKey;
        const isBooleanOption = typeof options === 'boolean';
        const opts = (!isBooleanOption && typeof options === 'object' && options !== null)
            ? options as EventOptions
            : undefined;
        const once = isBooleanOption ? options : Boolean(opts?.once);
        const signal = opts?.signal;

        const unsubscribe = () => this.off(event, listener);

        // If already aborted, do nothing but return a no-op unsubscribe for symmetry.
        if (signal?.aborted) {
            return () => {};
        }

        const entry: ListenerEntry<Events[K]> = { handler: listener, once };

        if (signal) {
            const abortListener = () => unsubscribe();
            signal.addEventListener('abort', abortListener, { once: true });
            entry.cleanup = () => signal.removeEventListener('abort', abortListener);
        }

        const bucket = this.listeners.get(key);
        if (bucket) {
            // De-dupe: avoid double registration of the same handler for the same event.
            if (!bucket.some(e => e.handler === listener)) {
                bucket.push(entry);
            }
        } else {
            this.listeners.set(key, [entry]);
        }

        return unsubscribe;
    }

    off<K extends keyof Events>(event: K, listener: Handler<Events[K]>): void {
        const key = event as unknown as PropertyKey;
        const bucket = this.listeners.get(key);
        if (!bucket) return;

        for (let i = 0; i < bucket.length; i++) {
            const entry = bucket[i];
            if (entry.handler === listener) {
                entry.cleanup?.();
                bucket.splice(i, 1);
                if (bucket.length === 0) {
                    this.listeners.delete(key);
                }
                break;
            }
        }
    }

    /**
     * Emit an event to all listeners.
     * Returns the number of listeners invoked.
     */
    emit<K extends keyof Events>(event: K, ...args: Params<Events[K]>): number {
        const key = event as unknown as PropertyKey;
        const bucket = this.listeners.get(key);
        if (!bucket || bucket.length === 0) {
            return 0;
        }

        let invoked = 0;

        // Copy to prevent issues if listeners mutate during dispatch.
        for (const entry of [...bucket]) {
            try {
                (entry.handler as Handler<Events[K]>)(...args);
            } catch (_err) {
                // Swallow by default; if you want, you could re-emit an 'error' event here.
                // this.emit('error' as unknown as K, err as any);
            }
            invoked++;
            if (entry.once) {
                this.off(event, entry.handler as Handler<Events[K]>);
            }
        }

        return invoked;
    }

    /**
     * Optional utilities
     */
    clear(event?: keyof Events): void {
        if (event === undefined) {
            for (const [, bucket] of this.listeners) {
                for (const e of bucket) e.cleanup?.();
            }
            this.listeners.clear();
            return;
        }
        const key = event as unknown as PropertyKey;
        const bucket = this.listeners.get(key);
        if (!bucket) return;
        for (const e of bucket) e.cleanup?.();
        this.listeners.delete(key);
    }

    listenerCount(event: keyof Events): number {
        return this.listeners.get(event as unknown as PropertyKey)?.length ?? 0;
    }
}

const eventBus = new EventBus<ClientEvents>();
export default eventBus;
export { EventBus };

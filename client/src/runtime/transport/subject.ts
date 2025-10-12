import type { TransportObservable, TransportSubscription } from "./types";

export class TransportSubject<T> implements TransportObservable<T> {
    private listeners = new Set<(value: T) => void>();

    subscribe(listener: (value: T) => void): TransportSubscription {
        this.listeners.add(listener);
        let active = true;
        return {
            unsubscribe: () => {
                if (!active) {
                    return;
                }
                active = false;
                this.listeners.delete(listener);
            },
        };
    }

    next(value: T) {
        for (const listener of this.listeners) {
            listener(value);
        }
    }

    clear() {
        this.listeners.clear();
    }
}

export type EventMap = Record<string, unknown>;
export type Handler<Payload> = (payload?: Payload) => void;

export class EventBus<E extends EventMap> {
    private handlers = new Map<keyof E, Set<Handler<any>>>();

    on<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
        let set = this.handlers.get(event);
        if (!set) {
            set = new Set();
            this.handlers.set(event, set);
        }
        set.add(handler as Handler<any>);
        return () => this.off(event, handler);
    }

    once<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
        const off = this.on(event, (payload) => {
            off();
            handler(payload);
        });
        return off;
    }

    off<K extends keyof E>(event: K, handler: Handler<E[K]>): void {
        this.handlers.get(event)?.delete(handler as Handler<any>);
    }

    emit<K extends keyof E>(event: K, payload?: E[K]): void {
        const set = this.handlers.get(event);
        if (!set || set.size === 0) return;
        [...set].forEach((h) => h(payload));
    }

    clear(): void {
        this.handlers.clear();
    }
}

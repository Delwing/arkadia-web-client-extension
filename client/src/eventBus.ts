import type { ClientEventMap, EventHandler, EventParams } from "./runtime/event-hub";

export type ClientEvents = ClientEventMap;

type Params<T> = EventParams<T>;
type Handler<T> = EventHandler<T>;

class EventBus<Events extends Record<string, any>> extends EventTarget {
    private wrappers = new WeakMap<Handler<any>, EventListener>();

    on<K extends keyof Events>(event: K, listener: Handler<Events[K]>, options?: AddEventListenerOptions | boolean) {
        const wrapper: EventListener = (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            if (Array.isArray(detail)) {
                (listener as (...args: any[]) => void)(...detail);
            } else if (detail !== undefined) {
                (listener as (...args: any[]) => void)(detail);
            } else {
                (listener as () => void)();
            }
        };
        this.wrappers.set(listener, wrapper);
        this.addEventListener(event as string, wrapper, options);
    }

    off<K extends keyof Events>(event: K, listener: Handler<Events[K]>) {
        const wrapper = this.wrappers.get(listener);
        if (wrapper) {
            this.removeEventListener(event as string, wrapper);
            this.wrappers.delete(listener);
        }
    }

    emit<K extends keyof Events>(event: K, ...args: Params<Events[K]>) {
        const detail = args.length === 1 ? args[0] : args;
        this.dispatchEvent(new CustomEvent(event as string, { detail }));
    }
}

const eventBus = new EventBus<ClientEvents>();
export default eventBus;
export { EventBus };

class EventBus extends EventTarget {
    private wrappers = new WeakMap<(...args: any[]) => void, EventListener>();

    on(event: string, listener: (...args: any[]) => void, options?: AddEventListenerOptions | boolean) {
        const wrapper: EventListener = (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            if (Array.isArray(detail)) {
                listener(...detail);
            } else if (detail !== undefined) {
                listener(detail);
            } else {
                listener();
            }
        };
        this.wrappers.set(listener, wrapper);
        this.addEventListener(event, wrapper, options);
    }

    off(event: string, listener: (...args: any[]) => void) {
        const wrapper = this.wrappers.get(listener);
        if (wrapper) {
            this.removeEventListener(event, wrapper);
            this.wrappers.delete(listener);
        }
    }

    emit(event: string, ...args: any[]) {
        const detail = args.length === 1 ? args[0] : args;
        this.dispatchEvent(new CustomEvent(event, { detail }));
    }
}

const eventBus = new EventBus();
export default eventBus;

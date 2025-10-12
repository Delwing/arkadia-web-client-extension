export interface EventHubSubscription {
    unsubscribe(): void;
}

export class EventHub<Events extends Record<string, any>> {
    private readonly target = new EventTarget();
    private readonly wrappers = new Map<Function, EventListener>();

    on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): EventHubSubscription {
        const wrapper: EventListener = (ev: Event) => {
            const detail = (ev as CustomEvent).detail as Events[K];
            listener(detail);
        };
        this.wrappers.set(listener, wrapper);
        this.target.addEventListener(event as string, wrapper);
        return {
            unsubscribe: () => this.off(event, listener)
        };
    }

    off<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void) {
        const wrapper = this.wrappers.get(listener);
        if (!wrapper) {
            return;
        }
        this.target.removeEventListener(event as string, wrapper);
        this.wrappers.delete(listener);
    }

    emit<K extends keyof Events>(event: K, payload: Events[K]) {
        this.target.dispatchEvent(new CustomEvent(event as string, { detail: payload }));
    }
}

export type RuntimeEvents = {
    message: string;
    command: string;
    gmcp: { path: string; value: unknown };
    gmcpMessage: { type: string; text: string };
    outputLine: { text: string; rawText: string; type: string; index: number };
    outputFlushed: { count: number };
    lineSent: { type: string };
} & Record<`gmcp.${string}`, unknown>;

type RuntimeEventHubGlobal = typeof globalThis & {
    runtimeEventHub?: EventHub<RuntimeEvents>;
};

const runtimeEventHubGlobal = globalThis as RuntimeEventHubGlobal;

export const runtimeEventHub =
    runtimeEventHubGlobal.runtimeEventHub ??
    (runtimeEventHubGlobal.runtimeEventHub = new EventHub<RuntimeEvents>());

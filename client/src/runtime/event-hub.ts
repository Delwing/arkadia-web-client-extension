import eventBus from "../eventBus";

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

export interface RuntimeEvents {
    message: string;
    command: string;
    gmcp: { path: string; value: unknown };
    gmcpMessage: { type: string; text: string };
    outputLine: { text: string; rawText: string; type: string; index: number };
    outputFlushed: { count: number };
    lineSent: { type: string };
}

export const runtimeEventHub = new EventHub<RuntimeEvents>();

export function bridgeRuntimeEventsToLegacyEventBus(
    eventHub: EventHub<RuntimeEvents>,
): () => void {
    const subscriptions: EventHubSubscription[] = [];

    subscriptions.push(eventHub.on("message", (text) => {
        eventBus.emit("message", text);
    }));

    subscriptions.push(eventHub.on("gmcp", ({ path, value }) => {
        eventBus.emit(`gmcp.${path}` as `gmcp.${string}`, value);
        eventBus.emit("gmcp", { path, value });
    }));

    subscriptions.push(eventHub.on("gmcpMessage", ({ type, text }) => {
        eventBus.emit(`gmcp_msg.${type}` as `gmcp_msg.${string}`, text);
    }));

    subscriptions.push(eventHub.on("outputFlushed", ({ count }) => {
        eventBus.emit("output-sent", count);
    }));

    subscriptions.push(eventHub.on("lineSent", () => {
        eventBus.emit("line-sent");
    }));

    subscriptions.push(eventHub.on("command", (command) => {
        eventBus.emit("command", command);
    }));

    return () => {
        subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
}

bridgeRuntimeEventsToLegacyEventBus(runtimeEventHub);

import type { LetterSubmitPayload } from "./types/letter";
import type { ClickCallbackMap } from "./OutputHandler";

export interface KnownEvents {
    'command': string;
    'port-connected': void;
    'output-sent': number | null | void;
    'buffer-sent': number | void;
    'output': {
        message: string;
        type?: string;
        clickCallbacks?: ClickCallbackMap;
    };
    'mapMove': void;
    'stepBack': void;
    'leadTo': number | void;
    'notify': { text: string };
    'lampTimer': number | null;
    'coverTimer': number | null;
    'breakItem': { text: string; command?: string };
    'packageStatus': { recipient: string; seconds?: number } | null;
    'releaseGuard': boolean;
    'attackMode': string;
    'contentWidth': number;
    'enterLocation': { id: number; room: any };
    'highlights': number[];
    'multibinds': { list: { index: number; action: string; label: string }[] };
    'letterComposer': { open: boolean };
    'letterComposer.submit': LetterSubmitPayload;
    'letterComposer.preview': LetterSubmitPayload;
    'npc': any;
    'zaskTimer': { seconds: number; ok: boolean } | null;
    'moveModeChanged': number;
    'line': [string, string | undefined];
    'line-start': void;
    'message': string | [string, string | undefined, ClickCallbackMap | undefined];
    'gmcp': { path: string; value: any };
    'refreshPositionWhenAble': void;
    'teamLeaderTargetNoAvatar': string;
    'teamLeaderTargetAvatar': void;
    'teamChange': void;
    'recording.start': string;
    'recording.stop': boolean | undefined;
    'playback.start': number | void;
    'playback.stop': void;
    'playback.pause': void;
    'playback.resume': void;
    'playback.index': [number, number];
}

export type ClientEvents = KnownEvents & {
    [key: `gmcp.${string}`]: any;
    [key: `gmcp_msg.${string}`]: string;
    [key: string]: any;
};

export type Params<T> = T extends void
    ? []
    : T extends any[]
        ? T
        : [T];
export type EventParams<Events extends Record<string, any>, K extends keyof Events> = Params<Events[K]>;
type Handler<T> = (...args: Params<T>) => void;

type EventDetail<T> = T extends void
    ? undefined
    : T extends any[]
        ? T
        : T;

const BRIDGE_EVENT_NAME = "arkadia.client.bridge";

interface BridgeEventPayload {
    origin: string;
    type: string;
    detail: unknown;
}

class EventBus<Events extends Record<string, any>> extends EventTarget {
    private wrappers = new WeakMap<Handler<any>, EventListener>();
    private readonly origin = `bus-${Math.random().toString(36).slice(2)}`;
    private bridging = false;

    constructor() {
        super();

        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener(BRIDGE_EVENT_NAME, (rawEvent: Event) => {
                const payload = (rawEvent as CustomEvent<BridgeEventPayload>).detail;
                if (!payload || payload.origin === this.origin) {
                    return;
                }
                this.bridging = true;
                try {
                    this.dispatchLocal(payload.type as keyof Events, payload.detail);
                } finally {
                    this.bridging = false;
                }
            });
        }
    }

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
        const detail = (args.length === 0
            ? undefined
            : args.length === 1
                ? args[0]
                : args) as EventDetail<Events[K]>;

        this.dispatchLocal(event, detail);

        if (!this.bridging && typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
            const payload: BridgeEventPayload = {
                origin: this.origin,
                type: event as string,
                detail,
            };
            try {
                window.dispatchEvent(new CustomEvent(BRIDGE_EVENT_NAME, { detail: payload }));
            } catch {
                // Some payloads (e.g. functions) cannot cross realms; ignore bridging errors.
            }
        }
    }

    private dispatchLocal(event: keyof Events, detail: unknown) {
        super.dispatchEvent(new CustomEvent(event as string, { detail }));
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
            window.dispatchEvent(new CustomEvent(event as string, { detail }));
        }
    }
}

const GLOBAL_EVENT_BUS_KEY = Symbol.for("arkadia.client.eventBus");
type GlobalWithEventBus = typeof globalThis & {
    [GLOBAL_EVENT_BUS_KEY]?: EventBus<ClientEvents>;
};

const globalWithEventBus = globalThis as GlobalWithEventBus;

if (!globalWithEventBus[GLOBAL_EVENT_BUS_KEY]) {
    globalWithEventBus[GLOBAL_EVENT_BUS_KEY] = new EventBus<ClientEvents>();
}

const eventBus = globalWithEventBus[GLOBAL_EVENT_BUS_KEY]!;
export default eventBus;
export { EventBus };
export type { Handler };

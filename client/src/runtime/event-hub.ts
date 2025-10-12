import type { LetterSubmitPayload } from "../types/letter";

export interface KnownEvents {
    'command': string;
    'port-connected': void;
    'output-sent': number;
    'buffer-sent': number;
    'mapMove': void;
    'stepBack': void;
    'leadTo': number;
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
    'line-start': void;
}

export type ClientEventMap = KnownEvents & {
    [key: `gmcp.${string}`]: any;
    [key: `gmcp_msg.${string}`]: string;
    [key: string]: any;
};

export type EventParams<T> = T extends void ? [] : T extends any[] ? T : [T];
export type EventHandler<T> = (...args: EventParams<T>) => void;

export type EventKey = Extract<keyof ClientEventMap, string>;

export interface EventTopic<K extends EventKey> {
    readonly key: K;
}

export type TopicInput<K extends EventKey> = K | EventTopic<K>;

export interface EventHub {
    readonly target: EventTarget;
    subscribe<K extends EventKey>(
        topic: TopicInput<K>,
        handler: EventHandler<ClientEventMap[K]>,
        options?: AddEventListenerOptions | boolean,
    ): () => void;
    publish<K extends EventKey>(topic: TopicInput<K>, ...args: EventParams<ClientEventMap[K]>): void;
    topic<K extends EventKey>(key: K): EventTopic<K>;
}

export function resolveTopic<K extends EventKey>(topic: TopicInput<K>): K {
    if (typeof topic === 'string') {
        return topic;
    }
    if (topic && typeof topic === 'object' && 'key' in topic) {
        return topic.key;
    }
    return String(topic) as K;
}

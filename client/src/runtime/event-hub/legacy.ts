import eventBus from "../../eventBus";
import type {
    ClientEventMap,
    EventHandler,
    EventHub,
    EventKey,
    EventParams,
    EventTopic,
    TopicInput,
} from "../event-hub";
import { resolveTopic } from "../event-hub";

function createDetail(args: unknown[]): unknown {
    if (args.length === 0) {
        return undefined;
    }
    if (args.length === 1) {
        return args[0];
    }
    return args;
}

export default class LegacyEventHub implements EventHub {
    readonly target = eventBus;

    topic<K extends EventKey>(key: K): EventTopic<K> {
        return { key };
    }

    subscribe<K extends EventKey>(
        topic: TopicInput<K>,
        handler: EventHandler<ClientEventMap[K]>,
        options?: AddEventListenerOptions | boolean,
    ): () => void {
        const key = resolveTopic(topic);
        eventBus.on(key, handler as EventHandler<any>, options);
        return () => {
            eventBus.off(key, handler as EventHandler<any>);
        };
    }

    publish<K extends EventKey>(topic: TopicInput<K>, ...args: EventParams<ClientEventMap[K]>): void {
        const key = resolveTopic(topic);
        eventBus.emit(key, ...args);
        const detail = createDetail(args as unknown[]);
        window.dispatchEvent(new CustomEvent(String(key), { detail }));
    }
}

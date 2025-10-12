import type { StateCreator, StoreApi } from "./index";

interface SubscribeOptions<Slice> {
    equalityFn?: (a: Slice, b: Slice) => boolean;
    fireImmediately?: boolean;
}

type ExtendedStoreApi<TState> = StoreApi<TState> & {
    subscribe: StoreApi<TState>["subscribe"] & {
        <Slice>(
            selector: (state: TState) => Slice,
            listener: (slice: Slice, previousSlice: Slice) => void,
            options?: SubscribeOptions<Slice>,
        ): () => void;
    };
};

const defaultEquality = <T>(a: T, b: T) => Object.is(a, b);

export function subscribeWithSelector<TState>(
    initializer: StateCreator<TState, any, any, ExtendedStoreApi<TState>>,
): StateCreator<TState, any, any, ExtendedStoreApi<TState>> {
    return (set, get, api) => {
        const baseSubscribe = api.subscribe.bind(api);

        (api as ExtendedStoreApi<TState>).subscribe = ((arg1: unknown, arg2?: unknown, arg3?: unknown) => {
            if (typeof arg1 === "function" && typeof arg2 === "function") {
                const selector = arg1 as (state: TState) => unknown;
                const listener = arg2 as (slice: unknown, previousSlice: unknown) => void;
                const options = (arg3 as SubscribeOptions<unknown>) ?? {};
                let currentSlice = selector(get());

                if (options.fireImmediately) {
                    listener(currentSlice, currentSlice);
                }

                return baseSubscribe((state, previous) => {
                    const nextSlice = selector(state);
                    const equality = options.equalityFn ?? defaultEquality;
                    if (!equality(currentSlice, nextSlice)) {
                        const lastSlice = currentSlice;
                        currentSlice = nextSlice;
                        listener(nextSlice, lastSlice);
                    }
                });
            }

            return baseSubscribe(arg1 as (state: TState, previous: TState) => void);
        }) as ExtendedStoreApi<TState>["subscribe"];

        return initializer(set, get, api as ExtendedStoreApi<TState>);
    };
}

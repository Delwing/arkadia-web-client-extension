import { useSyncExternalStore } from "react";

export type PartialState<T> = Partial<T> | ((state: T) => Partial<T> | T);

export interface StoreApi<T> {
    getState(): T;
    setState(partial: PartialState<T>, replace?: boolean): void;
    subscribe(listener: (state: T, prevState: T) => void): () => void;
    destroy(): void;
}

export type StateCreator<T> = (
    set: StoreApi<T>["setState"],
    get: StoreApi<T>["getState"],
    api: StoreApi<T>,
) => T;

export function createStore<T>(creator: StateCreator<T>): StoreApi<T> {
    const listeners = new Set<(state: T, prevState: T) => void>();
    let state: T;

    const api: StoreApi<T> = {
        getState: () => state,
        setState: (partial, replace = false) => {
            const previous = state;
            const partialResult =
                typeof partial === "function" ? (partial as (state: T) => Partial<T> | T)(state) : partial;

            const nextState = replace
                ? (partialResult as T)
                : ({
                      ...state,
                      ...(partialResult as Partial<T>),
                  } as T);

            if (Object.is(nextState, previous)) {
                return;
            }

            state = nextState;
            listeners.forEach((listener) => listener(state, previous));
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        destroy: () => {
            listeners.clear();
        },
    };

    state = creator(api.setState, api.getState, api);
    return api;
}

type EqualityFn<Slice> = (a: Slice, b: Slice) => boolean;

interface SubscribeWithSelectorOptions<Slice> {
    readonly equalityFn?: EqualityFn<Slice>;
    readonly fireImmediately?: boolean;
}

type Selector<TState, Slice> = (state: TState) => Slice;

type SubscribeWithSelector<TState> = StoreApi<TState>["subscribe"] & {
    <Slice>(
        selector: Selector<TState, Slice>,
        listener: (slice: Slice, previousSlice: Slice) => void,
        options?: SubscribeWithSelectorOptions<Slice>,
    ): () => void;
};

export function subscribeWithSelector<TState>(initializer: StateCreator<TState>): StateCreator<TState> {
    return (set, get, api) => {
        const originalSubscribe = api.subscribe.bind(api);
        const storeWithSelector = api as StoreApi<TState> & { subscribe: SubscribeWithSelector<TState> };

        storeWithSelector.subscribe = (selectorOrListener: any, listener?: any, options?: any) => {
            if (typeof listener !== "function") {
                return originalSubscribe(selectorOrListener as (state: TState, prevState: TState) => void);
            }

            const selector = selectorOrListener as Selector<TState, unknown>;
            const equalityFn: EqualityFn<unknown> = options?.equalityFn ?? Object.is;
            let currentSlice = selector(api.getState());

            if (options?.fireImmediately) {
                listener(currentSlice, currentSlice);
            }

            return originalSubscribe((state) => {
                const nextSlice = selector(state);
                const previousSlice = currentSlice;
                if (!equalityFn(nextSlice, previousSlice)) {
                    currentSlice = nextSlice;
                    listener(nextSlice, previousSlice);
                }
            });
        };

        return initializer(set, get, api);
    };
}

export function useStore<TState, Slice = TState>(
    store: StoreApi<TState>,
    selector?: Selector<TState, Slice>,
    equalityFn?: EqualityFn<Slice>,
): Slice {
    const sliceSelector = selector ?? ((state: TState) => state as unknown as Slice);
    const comparator = equalityFn ?? Object.is;

    return useSyncExternalStore(
        (notify) =>
            store.subscribe((state, previous) => {
                const nextSlice = sliceSelector(state);
                const prevSlice = sliceSelector(previous);
                if (!comparator(nextSlice, prevSlice)) {
                    notify();
                }
            }),
        () => sliceSelector(store.getState()),
        () => sliceSelector(store.getState()),
    );
}

export function shallow<T>(a: T, b: T): boolean {
    if (Object.is(a, b)) {
        return true;
    }
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
        return false;
    }
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    for (const key of aKeys) {
        if (!Object.prototype.hasOwnProperty.call(b, key)) {
            return false;
        }
        if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
            return false;
        }
    }
    return true;
}

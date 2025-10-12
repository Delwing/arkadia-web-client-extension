export type StateListener<TState> = (state: TState, previousState: TState) => void;

export interface StoreApi<TState> {
    getState(): TState;
    setState(
        partial: Partial<TState> | ((state: TState) => Partial<TState> | TState),
        replace?: boolean,
    ): void;
    subscribe(listener: StateListener<TState>): () => void;
    subscribe<TSlice>(
        selector: (state: TState) => TSlice,
        listener: (slice: TSlice, previousSlice: TSlice) => void,
        options?: { fireImmediately?: boolean; equalityFn?: (a: TSlice, b: TSlice) => boolean },
    ): () => void;
}

function resolvePartial<TState>(
    state: TState,
    partial: Partial<TState> | ((current: TState) => Partial<TState> | TState),
): Partial<TState> | TState {
    return typeof partial === "function" ? (partial as (current: TState) => Partial<TState> | TState)(state) : partial;
}

export function createStore<TState>(
    initializer: (
        set: StoreApi<TState>["setState"],
        get: StoreApi<TState>["getState"],
        api: StoreApi<TState>,
    ) => TState,
): StoreApi<TState> {
    let state: TState;
    const listeners = new Set<StateListener<TState>>();

    const api: StoreApi<TState> = {
        getState: () => state,
        setState: (partial, replace) => {
            const previousState = state;
            const resolved = resolvePartial(state, partial);
            const nextState = replace ? (resolved as TState) : { ...state, ...(resolved as Partial<TState>) };
            if (Object.is(previousState, nextState)) {
                return;
            }
            state = nextState;
            listeners.forEach((listener) => listener(state, previousState));
        },
        subscribe: ((selectorOrListener: any, listenerOrOptions?: any, maybeOptions?: any) => {
            const hasSelector = typeof listenerOrOptions === "function";
            const selector = hasSelector ? selectorOrListener : (value: TState) => value;
            const listener = hasSelector ? listenerOrOptions : selectorOrListener;
            const options = (hasSelector ? maybeOptions : listenerOrOptions) ?? {};
            const { fireImmediately = false, equalityFn } = options as {
                fireImmediately?: boolean;
                equalityFn?: (a: unknown, b: unknown) => boolean;
            };

            let currentSlice = selector(state);
            if (fireImmediately) {
                listener(currentSlice, currentSlice);
            }

            const subscription: StateListener<TState> = (nextState, previousState) => {
                const nextSlice = selector(nextState);
                const prevSlice = currentSlice;
                const isEqual = typeof equalityFn === "function"
                    ? equalityFn(nextSlice, prevSlice)
                    : Object.is(nextSlice, prevSlice);
                if (isEqual) {
                    return;
                }
                currentSlice = nextSlice;
                listener(nextSlice, prevSlice);
            };

            listeners.add(subscription);
            return () => {
                listeners.delete(subscription);
            };
        }) as StoreApi<TState>["subscribe"],
    } as StoreApi<TState>;

    state = initializer(api.setState.bind(api), api.getState.bind(api), api);
    return api;
}

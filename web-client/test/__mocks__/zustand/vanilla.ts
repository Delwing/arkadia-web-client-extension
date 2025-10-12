import type { StateCreator, StoreApi } from "./index";

type Listener<TState> = (state: TState, previousState: TState) => void;

export function createStore<TState>(
    initializer: StateCreator<
        TState,
        StoreApi<TState>["setState"],
        StoreApi<TState>["getState"],
        StoreApi<TState>
    >,
): StoreApi<TState> {
    let state!: TState;
    const listeners = new Set<Listener<TState>>();

    const api: StoreApi<TState> = {
        getState: () => state,
        setState(partial, replace = false) {
            const previous = state;
            const nextPartial = typeof partial === "function" ? partial(state) : partial;
            if (nextPartial === undefined) {
                return;
            }

            state = replace ? (nextPartial as TState) : Object.assign({}, state, nextPartial);
            listeners.forEach((listener) => listener(state, previous));
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };

    state = initializer(api.setState, api.getState, api);
    return api;
}

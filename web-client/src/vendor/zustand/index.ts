import { useCallback, useRef, useSyncExternalStore } from "react";
import type { StoreApi } from "./vanilla";

export function useStore<TState, StateSlice = TState>(
    store: StoreApi<TState>,
    selector: (state: TState) => StateSlice = (state) => state as unknown as StateSlice,
    equalityFn: (a: StateSlice, b: StateSlice) => boolean = Object.is,
): StateSlice {
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    const equalityRef = useRef(equalityFn);
    equalityRef.current = equalityFn;

    const subscribe = useCallback(
        (notify: () => void) =>
            store.subscribe<StateSlice>(
                (state) => selectorRef.current(state),
                () => {
                    notify();
                },
                { equalityFn: equalityRef.current },
            ),
        [store],
    );

    const getSnapshot = useCallback(
        () => selectorRef.current(store.getState()),
        [store],
    );

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

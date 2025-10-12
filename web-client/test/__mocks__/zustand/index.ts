import { useRef, useSyncExternalStore } from "react";

export type StateCreator<TState, CustomSetState = any, CustomGetState = any, StoreApiType = any> = (
    set: CustomSetState,
    get: CustomGetState,
    api: StoreApiType,
) => TState;

export type StoreApi<TState> = {
    getState: () => TState;
    setState: (
        partial: Partial<TState> | ((state: TState) => Partial<TState>),
        replace?: boolean,
    ) => void;
    subscribe: (listener: (state: TState, previousState: TState) => void) => () => void;
};

const defaultEquality = <T>(a: T, b: T) => Object.is(a, b);

export function useStore<TState, StateSlice = TState>(
    store: StoreApi<TState>,
    selector?: (state: TState) => StateSlice,
    equalityFn?: (a: StateSlice, b: StateSlice) => boolean,
): StateSlice {
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    const equalityRef = useRef(equalityFn ?? defaultEquality<StateSlice>);
    equalityRef.current = equalityFn ?? equalityRef.current;

    const getSnapshot = () => {
        const state = store.getState();
        return selectorRef.current ? selectorRef.current(state) : (state as unknown as StateSlice);
    };

    const subscribe = (onStoreChange: () => void) =>
        store.subscribe(() => {
            onStoreChange();
        });

    const slice = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const previousSliceRef = useRef(slice);
    if (!equalityRef.current(previousSliceRef.current, slice)) {
        previousSliceRef.current = slice;
    }

    return previousSliceRef.current;
}

declare module 'zustand' {
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

    export function useStore<TState, StateSlice = TState>(
        store: StoreApi<TState>,
        selector?: (state: TState) => StateSlice,
        equalityFn?: (a: StateSlice, b: StateSlice) => boolean,
    ): StateSlice;
}

declare module 'zustand/vanilla' {
    import type { StateCreator, StoreApi } from 'zustand';

    export function createStore<TState>(
        initializer: StateCreator<TState, StoreApi<TState>['setState'], StoreApi<TState>['getState'], StoreApi<TState>>,
    ): StoreApi<TState>;
}

declare module 'zustand/middleware' {
    import type { StateCreator } from 'zustand';

    export function subscribeWithSelector<TState>(
        initializer: StateCreator<TState, any, any, any>,
    ): StateCreator<TState, any, any, any>;
}

declare module 'zustand/shallow' {
    export function shallow<T>(a: T, b: T): boolean;
}

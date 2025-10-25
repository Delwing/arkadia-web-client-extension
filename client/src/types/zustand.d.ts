declare module 'zustand' {
    export function useStore(...args: any[]): any;
}

declare module 'zustand/vanilla' {
    export function createStore<T>(...args: any[]): any;
}

declare module 'zustand/middleware' {
    export function subscribeWithSelector(...args: any[]): any;
}

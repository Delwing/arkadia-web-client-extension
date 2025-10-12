export function subscribeWithSelector<TState>(
    initializer: (
        set: (...args: any[]) => void,
        get: () => TState,
        api: unknown,
    ) => TState,
) {
    return initializer;
}

type Listener<T> = (state: T, previousState: T) => void;

export function createStore<T>() {
  return (
    initializer: (
      setState: (
        partial: Partial<T> | ((state: T) => Partial<T>),
        replace?: boolean,
      ) => void,
      getState: () => T,
      api: {
        setState: (
          partial: Partial<T> | ((state: T) => Partial<T>),
          replace?: boolean,
        ) => void;
        getState: () => T;
        subscribe: (listener: Listener<T>) => () => void;
      },
    ) => T,
  ) => {
    let state: T;
    const listeners = new Set<Listener<T>>();

    const getState = () => state;

    const setState = (
      partial: Partial<T> | ((state: T) => Partial<T>),
      replace = false,
    ) => {
      const next = typeof partial === 'function'
        ? (partial as (state: T) => Partial<T>)(state)
        : partial;
      const previous = state;
      state = replace ? (next as T) : { ...state, ...next };
      listeners.forEach((listener) => listener(state, previous));
    };

    const subscribe = (listener: Listener<T>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };

    const api = { setState, getState, subscribe };
    state = initializer(setState, getState, api);
    return api;
  };
}

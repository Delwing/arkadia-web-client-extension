export interface TransportSubscription {
    unsubscribe(): void;
}

export interface TransportObservable<T> {
    subscribe(listener: (value: T) => void): TransportSubscription;
}

export interface TransportConnectOptions {
    manual?: boolean;
}

export type TransportIn =
    | { type: 'open'; event: Event }
    | { type: 'close'; event: CloseEvent }
    | { type: 'error'; event: Event }
    | { type: 'data'; payload: string };

export type TransportOut =
    | { kind: 'text'; payload: string }
    | { kind: 'gmcp'; path: string; payload?: unknown }
    | { kind: 'raw'; payload: string };

export interface TransportAdapter {
    readonly messages$: TransportObservable<TransportIn>;

    connect(options?: TransportConnectOptions): void;

    disconnect(): void;

    send(message: TransportOut): void;
}

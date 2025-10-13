export interface Subscription {
    unsubscribe(): void;
}

export interface Observable<T> {
    on(listener: (value: T) => void): Subscription;
}

export class EventBus<T> implements Observable<T> {

    private listeners: ((value: T) => void)[] = [];

    on(listener: (value: T) => void): Subscription {
        this.listeners.push(listener);
        return {
            unsubscribe: () => {
                this.listeners = this.listeners.filter(l => l !== listener);
            }
        };
    }

    off(listener: (value: T) => void): void {
        this.listeners = this.listeners.filter(l => l !== listener);
    }

    emit(value: T): void {
        this.listeners.forEach(l => l(value));
    }

}
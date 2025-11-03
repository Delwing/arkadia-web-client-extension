let clientInstance: unknown = null;

export function setClientInstance<T>(instance: T): T {
    clientInstance = instance;
    (globalThis as any).clientExtension = instance;
    return instance;
}

export function getClientInstance<T = any>(): T | null {
    if (clientInstance) {
        return clientInstance as T;
    }
    const fromGlobal = (globalThis as any).clientExtension as T | undefined;
    if (fromGlobal) {
        clientInstance = fromGlobal;
        return fromGlobal;
    }
    return null;
}

export function requireClientInstance<T = any>(): T {
    const instance = getClientInstance<T>();
    if (!instance) {
        throw new Error('clientInstance is not registered');
    }
    return instance;
}

export function clearClientInstance(): void {
    clientInstance = null;
    if ('clientExtension' in (globalThis as any)) {
        delete (globalThis as any).clientExtension;
    }
}

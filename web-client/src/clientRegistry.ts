import type Client from "@client/src/Client";

let clientInstance: Client | null = null;

export function setClientInstance(instance: Client): void {
    clientInstance = instance;
    (globalThis as any).clientExtension = instance;
}

export function getClientInstance(): Client | null {
    if (clientInstance) {
        return clientInstance;
    }
    const fromGlobal = (globalThis as any).clientExtension as Client | undefined;
    if (fromGlobal) {
        clientInstance = fromGlobal;
        return fromGlobal;
    }
    return null;
}

export function clearClientInstance(): void {
    clientInstance = null;
    if ('clientExtension' in (globalThis as any)) {
        delete (globalThis as any).clientExtension;
    }
}

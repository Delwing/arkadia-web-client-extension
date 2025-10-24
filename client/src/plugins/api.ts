import type Client from "../Client";
import type { CommandOptions } from "../scripts/commandPreserveCaseMode";
import storage from "../storage";

export interface PluginClientAPI {
    sendCommand(command: string, echo?: boolean, options?: CommandOptions): void;
    send(command: string, echo?: boolean, options?: CommandOptions): void;
    addEventListener(event: string, listener: (ev: CustomEvent) => void, options?: AddEventListenerOptions | boolean): () => void;
    removeEventListener(event: string, listener: EventListenerOrEventListenerObject | null): void;
    sendEvent(type: string, payload?: any): void;
    print(text: string): void;
    println(text: string): void;
}

export interface StorageChangeMap {
    [key: string]: {
        oldValue: any;
        newValue: any;
    };
}

export interface PluginStorageAPI {
    getItem<T = any>(key: string): Promise<T | undefined>;
    setItem<T = any>(key: string, value: T): Promise<void>;
    downloadItem<T = any>(url: string, ttl: number): Promise<T>;
    onChanged(listener: (changes: StorageChangeMap) => void): () => void;
}

export interface PluginUIHooks {
    registerOptionsPanel?(pluginUrl: string, panelId: string, render: () => void): void;
    unregisterOptionsPanel?(pluginUrl: string, panelId?: string): void;
}

export interface ArkadiaAdapter {
    on?(event: string, listener: (...args: any[]) => void): void;
    off?(event: string, listener: (...args: any[]) => void): void;
    emit?(event: string, ...args: any[]): void;
    send?(command: string, echo?: boolean, options?: CommandOptions): void;
    sendGmcp?(type: string, payload?: any): void;
}

export interface PluginHostOptions {
    arkadia?: ArkadiaAdapter;
    ui?: PluginUIHooks;
}

export interface PluginAPI {
    scriptUrl: string;
    client: PluginClientAPI;
    storage: PluginStorageAPI;
    arkadia?: ArkadiaAdapter;
    ui?: PluginUIHooks;
}

export interface PluginDefinition {
    name?: string;
    setup(api: PluginAPI): void | (() => void) | Promise<void | (() => void)>;
    dispose?(api: PluginAPI): void | Promise<void>;
}

export type RegisterArkadiaPlugin = (definition: PluginDefinition) => void;

export function createClientAPI(client: Client): PluginClientAPI {
    return {
        sendCommand: (command: string, echo?: boolean, options?: CommandOptions) => client.sendCommand(command, echo, options),
        send: (command: string, echo?: boolean, options?: CommandOptions) => client.send(command, echo, options),
        addEventListener: (event: string, listener: (ev: CustomEvent) => void, options?: AddEventListenerOptions | boolean) => client.addEventListener(event, listener, options),
        removeEventListener: (event: string, listener: EventListenerOrEventListenerObject | null) => client.removeEventListener(event, listener),
        sendEvent: (type: string, payload?: any) => client.sendEvent(type, payload),
        print: (text: string) => client.print(text),
        println: (text: string) => client.println(text),
    };
}

export function createStorageAPI(): PluginStorageAPI {
    const addListener = storage.onChanged?.addListener?.bind(storage.onChanged);
    const removeListener = storage.onChanged?.removeListener?.bind(storage.onChanged);

    return {
        async getItem<T = any>(key: string): Promise<T | undefined> {
            const result = await storage.getItem(key);
            if (result && Object.prototype.hasOwnProperty.call(result, key)) {
                return result[key] as T;
            }
            return undefined;
        },
        setItem<T = any>(key: string, value: T): Promise<void> {
            return storage.setItem(key, value);
        },
        downloadItem<T = any>(url: string, ttl: number): Promise<T> {
            return storage.downloadItem(url, ttl) as unknown as Promise<T>;
        },
        onChanged(listener: (changes: StorageChangeMap) => void): () => void {
            if (!addListener) {
                return () => {};
            }
            const handler = (changes: StorageChangeMap) => listener(changes);
            addListener(handler);
            return () => {
                if (removeListener) {
                    removeListener(handler);
                }
            };
        },
    };
}

declare global {
    interface Window {
        registerArkadiaPlugin?: RegisterArkadiaPlugin;
    }
}

// Keep the interfaces below in sync with the implementations in
// ../client/src/plugins/api.ts.

import type Client from "@client/src/Client";

export interface CommandOptions {
    preserveCase?: boolean;
}

export interface PluginClientAPI {
    readonly extension: Client;
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

export interface PluginMenuButtonOptions {
    id?: string;
    label: string;
    title?: string;
    beforeId?: string;
    className?: string;
}

export interface PluginModalOptions {
    title: string;
    body?: string | Node;
    footer?: string | Node;
    size?: "sm" | "lg" | "xl";
    scrollable?: boolean;
    show?: boolean;
}

export interface PluginModalHandle {
    element: HTMLElement;
    body: HTMLElement;
    footer: HTMLElement | null;
    setTitle(title: string): void;
    setBody(content?: string | Node | null): void;
    setFooter(content?: string | Node | null): void;
    show(): void;
    hide(): void;
    dispose(): void;
}

export interface PluginUIHooks {
    registerOptionsPanel?(pluginUrl: string, panelId: string, render: () => void): void;
    unregisterOptionsPanel?(pluginUrl: string, panelId?: string): void;
    registerMenuButton?(options: PluginMenuButtonOptions, handler: (event: MouseEvent) => void): () => void;
    openModal?(options: PluginModalOptions): PluginModalHandle;
}

export interface PluginUIManager {
    create(pluginUrl: string): PluginUIHooks | undefined;
    dispose?(pluginUrl: string): void;
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
    ui?: PluginUIHooks | PluginUIManager;
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


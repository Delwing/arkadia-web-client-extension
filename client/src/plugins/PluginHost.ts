import Client from "../Client";
import {
    createClientAPI,
    createStorageAPI,
    PluginAPI,
    PluginDefinition,
    PluginHostOptions,
    PluginUIHooks,
    PluginUIManager,
    RegisterArkadiaPlugin,
} from "./api";

type PluginUIResolution = {
    hooks?: PluginUIHooks;
    dispose?: () => void;
};

interface PluginState {
    definition: PluginDefinition;
    api: PluginAPI;
    setupPromise: Promise<void>;
    cleanup?: () => void | Promise<void>;
    uiDispose?: () => void;
}

export default class PluginHost {
    private readonly storageApi = createStorageAPI();
    private readonly plugins = new Map<string, PluginState>();

    constructor(private readonly client: Client, private readonly options: PluginHostOptions = {}) {}

    attachToWindow(): void {
        const register: RegisterArkadiaPlugin = (definition: PluginDefinition) => {
            const url = this.resolveCurrentScriptUrl();
            if (!url) {
                console.warn("Arkadia plugin registration ignored – unable to determine script URL.");
                return;
            }
            this.register(url, definition);
        };
        window.registerArkadiaPlugin = register;
    }

    register(scriptUrl: string, definition: PluginDefinition): void {
        if (!scriptUrl) {
            console.warn("Arkadia plugin registration ignored – missing script URL.");
            return;
        }
        const {hooks: uiHooks, dispose: uiDispose} = this.resolvePluginUI(scriptUrl);
        const api = this.createPluginAPI(scriptUrl, uiHooks);
        const state: PluginState = {
            definition,
            api,
            setupPromise: this.dispose(scriptUrl)
                .catch(err => console.error("Failed to dispose previous plugin", err))
                .then(() => Promise.resolve(definition.setup(api)))
                .then(result => {
                    if (typeof result === "function") {
                        state.cleanup = result;
                    }
                })
                .then(() => {
                    // ensure promise resolves to void
                }),
            uiDispose,
        };
        state.setupPromise.catch(err => {
            console.error(`Plugin setup failed for ${scriptUrl}`, err);
            this.plugins.delete(scriptUrl);
        });
        this.plugins.set(scriptUrl, state);
    }

    async dispose(scriptUrl: string): Promise<void> {
        const state = this.plugins.get(scriptUrl);
        if (!state) {
            return;
        }
        this.plugins.delete(scriptUrl);
        try {
            await state.setupPromise.catch(() => undefined);
        } catch (err) {
            console.error(`Plugin setup rejected for ${scriptUrl}`, err);
        }
        if (state.cleanup) {
            await Promise.resolve(state.cleanup()).catch(err => {
                console.error(`Plugin cleanup failed for ${scriptUrl}`, err);
            });
        }
        if (state.definition.dispose) {
            await Promise.resolve(state.definition.dispose(state.api)).catch(err => {
                console.error(`Plugin dispose hook failed for ${scriptUrl}`, err);
            });
        }
        if (state.uiDispose) {
            try {
                state.uiDispose();
            } catch (err) {
                console.error(`Plugin UI cleanup failed for ${scriptUrl}`, err);
            }
        }
    }

    async disposeAll(): Promise<void> {
        const tasks = Array.from(this.plugins.keys()).map(url => this.dispose(url));
        await Promise.all(tasks);
    }

    getRegisteredUrls(): string[] {
        return Array.from(this.plugins.keys());
    }

    private createPluginAPI(scriptUrl: string, uiHooks?: PluginUIHooks): PluginAPI {
        return {
            scriptUrl,
            client: createClientAPI(this.client),
            storage: this.storageApi,
            arkadia: this.options.arkadia,
            ui: uiHooks,
        };
    }

    private resolvePluginUI(scriptUrl: string): PluginUIResolution {
        const option = this.options.ui;
        if (!option) {
            return {};
        }
        if (typeof option === "object" && "create" in option && typeof option.create === "function") {
            const manager = option as PluginUIManager;
            const hooks = manager.create(scriptUrl);
            const dispose = manager.dispose ? () => manager.dispose!(scriptUrl) : undefined;
            return {hooks, dispose};
        }
        return {hooks: option as PluginUIHooks};
    }

    private resolveCurrentScriptUrl(): string | null {
        const current = document.currentScript as HTMLScriptElement | null;
        if (!current) {
            return null;
        }
        const fromDataset = current.dataset?.arkadiaPluginUrl;
        if (fromDataset) {
            return fromDataset;
        }
        if (current.src) {
            return current.src;
        }
        return null;
    }
}

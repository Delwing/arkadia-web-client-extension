import Client from "../Client";
import {
    createClientAPI,
    createStorageAPI,
    PluginAPI,
    PluginDefinition,
    PluginHostOptions,
    PluginUIHooks,
    PluginUIManager,
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

    async load(scriptUrl: string): Promise<void> {
        const definition = await this.importPluginDefinition(scriptUrl);
        await this.register(scriptUrl, definition);
    }

    register(scriptUrl: string, definition: PluginDefinition): Promise<void> {
        if (!scriptUrl) {
            console.warn("Arkadia plugin registration ignored – missing script URL.");
            return Promise.resolve();
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
        return state.setupPromise;
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

    private async importPluginDefinition(scriptUrl: string): Promise<PluginDefinition> {
        const response = await fetch(scriptUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const code = await response.text();
        const blobUrl = URL.createObjectURL(new Blob([code], {type: "text/javascript"}));
        try {
            const module = await import(/* @vite-ignore */ blobUrl);
            return this.resolveModuleDefinition(module);
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    }

    private resolveModuleDefinition(module: any): PluginDefinition {
        const candidates = [module?.default, module];
        for (const candidate of candidates) {
            if (!candidate) {
                continue;
            }
            if (typeof candidate === "function") {
                return {setup: candidate};
            }
            if (typeof candidate === "object" && typeof candidate.setup === "function") {
                return candidate as PluginDefinition;
            }
        }
        throw new Error("Plugin missing setup(api)");
    }
}

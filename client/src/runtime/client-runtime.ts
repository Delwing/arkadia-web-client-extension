import type Client from "../Client";
import type { CommandDispatcher } from "./command-dispatcher";
import type { DefaultDataCatalog } from "./data";
import type { EventHub, RuntimeEvents } from "./event-hub";
import type { SettingsService } from "./settings/settings-service";

export interface ClientContext {
    readonly client: Client;
    readonly eventHub: EventHub<RuntimeEvents>;
    readonly settings: SettingsService;
    readonly dataCatalog: DefaultDataCatalog;
    readonly commands: CommandDispatcher;
}

export type RuntimeModule = (context: ClientContext) => void;

export default class ClientRuntime {
    private readonly modules: RuntimeModule[] = [];

    constructor(private readonly context: ClientContext) {}

    registerModule(module: RuntimeModule): this {
        this.modules.push(module);
        return this;
    }

    registerModules(modules: RuntimeModule[]): this {
        modules.forEach((module) => this.registerModule(module));
        return this;
    }

    initialise(): void {
        this.modules.forEach((module) => module(this.context));
    }

    getContext(): ClientContext {
        return this.context;
    }
}

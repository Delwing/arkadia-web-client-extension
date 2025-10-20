import Client from '@client/src/Client';
import { registerScripts } from '@client/src/main';
import type { ClientEvents, EventBus } from '@client/src/eventBus';

import arkadiaClient from '../ArkadiaClient';
import MockPort from '../MockPort';
import initSessionLogger from '../sessionLogger';
import { clearClientInstance, getEventHub, setClientInstance } from './clientProvider';
import { clearEmbeddedMap } from './mapProvider';
import {
    SettingsService,
    clearSettingsService,
    createSettingsService,
    setSettingsService,
} from './settingsService';

type RuntimeContext = {
    client: Client;
    eventHub: EventBus<ClientEvents>;
    settingsService: SettingsService;
};

type RuntimeOptions = {
    enableSessionLogger?: boolean;
};

let runtimeContext: RuntimeContext | null = null;
let initPromise: Promise<RuntimeContext> | null = null;

export async function initRuntime(options: RuntimeOptions = {}): Promise<RuntimeContext> {
    if (runtimeContext) {
        return runtimeContext;
    }
    if (!initPromise) {
        initPromise = bootstrap(options).catch(err => {
            initPromise = null;
            throw err;
        });
    }
    runtimeContext = await initPromise;
    return runtimeContext;
}

async function bootstrap(options: RuntimeOptions): Promise<RuntimeContext> {
    const { enableSessionLogger = true } = options;
    const port = new MockPort();
    const client = new Client(arkadiaClient, port);
    setClientInstance(client);
    (globalThis as any).client = arkadiaClient;

    registerScripts(client);

    if (enableSessionLogger) {
        try {
            await initSessionLogger(arkadiaClient);
        } catch (err) {
            console.error('Logger init failed', err);
        }
    }

    client.connect(port, true);

    const settingsService = createSettingsService();
    setSettingsService(settingsService);

    const eventHub = getEventHub();
    settingsService.onChange(settings => {
        client.sendEvent('settings.updated', settings);
    });

    return { client, eventHub, settingsService };
}

export function getRuntimeContext(): RuntimeContext {
    if (!runtimeContext) {
        throw new Error('Runtime has not been initialised.');
    }
    return runtimeContext;
}

export function resetRuntimeForTests() {
    runtimeContext = null;
    initPromise = null;
    clearSettingsService();
    clearEmbeddedMap();
    clearClientInstance();
    if ((globalThis as any).client) {
        delete (globalThis as any).client;
    }
}

export type { RuntimeContext, RuntimeOptions };

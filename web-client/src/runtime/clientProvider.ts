import type Client from '@client/src/Client';
import type { ClientEvents, EventBus } from '@client/src/eventBus';

type CommandOptions = Parameters<Client['sendCommand']>[2];

type CommandDispatcher = {
    sendCommand: (command: string, echo?: boolean, options?: CommandOptions) => void;
    sendEvent: (type: string, payload?: any) => void;
};

let clientInstance: Client | null = null;
let eventHubInstance: EventBus<ClientEvents> | null = null;

const commandDispatcher: CommandDispatcher = {
    sendCommand(command: string, echo?: boolean, options?: CommandOptions) {
        getClient().sendCommand(command, echo, options);
    },
    sendEvent(type: string, payload?: any) {
        getClient().sendEvent(type, payload);
    },
};

export function setClientInstance(client: Client) {
    clientInstance = client;
    eventHubInstance = client.eventTarget as EventBus<ClientEvents>;
    (globalThis as any).clientExtension = client;
}

export function clearClientInstance() {
    clientInstance = null;
    eventHubInstance = null;
    if ((globalThis as any).clientExtension) {
        delete (globalThis as any).clientExtension;
    }
}

export function getClient(): Client {
    if (!clientInstance) {
        throw new Error('Client runtime has not been initialised. Call initRuntime() first.');
    }
    return clientInstance;
}

export function peekClient(): Client | null {
    return clientInstance;
}

export function getEventHub(): EventBus<ClientEvents> {
    if (!eventHubInstance) {
        throw new Error('Event hub has not been initialised. Call initRuntime() first.');
    }
    return eventHubInstance;
}

export function getCommandDispatcher(): CommandDispatcher {
    return commandDispatcher;
}

export type { CommandDispatcher };

import type Client from "../Client";

export interface CommandDispatcher {
    sendCommand(command: string, options?: { echo?: boolean }): boolean;
    sendEvent(type: string, payload?: unknown): void;
}

export class ClientCommandDispatcher implements CommandDispatcher {
    constructor(private readonly client: Client) {}

    sendCommand(command: string, options?: { echo?: boolean }): boolean {
        const echo = options?.echo ?? true;
        return this.client.sendCommand(command, echo);
    }

    sendEvent(type: string, payload?: unknown): void {
        this.client.sendEvent(type, payload);
    }

}


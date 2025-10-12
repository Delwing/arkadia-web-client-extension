import type Client from "@client/src/Client";

export interface MultibindPortRecord {
    roomId: number;
    index: number;
    action: string;
}

export type ExtensionCommand =
    | { type: "MULTIBINDS_LOAD" }
    | { type: "MULTIBINDS_SAVE"; value: MultibindPortRecord[] };

export interface CommandDispatcher {
    sendCommand(command: string, options?: { echo?: boolean }): void;
    sendEvent(type: string, payload?: unknown): void;
    sendExtensionCommand(command: ExtensionCommand): boolean;
}

export class ClientCommandDispatcher implements CommandDispatcher {
    constructor(private readonly client: Client) {}

    sendCommand(command: string, options?: { echo?: boolean }): void {
        const echo = options?.echo ?? true;
        this.client.sendCommand(command, echo);
    }

    sendEvent(type: string, payload?: unknown): void {
        this.client.sendEvent(type, payload);
    }

    sendExtensionCommand(command: ExtensionCommand): boolean {
        const port = this.client.port;
        if (port && typeof port.postMessage === "function") {
            port.postMessage(command);
            return true;
        }
        return false;
    }
}


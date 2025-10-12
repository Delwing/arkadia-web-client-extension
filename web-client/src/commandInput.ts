import type { CommandDispatcher } from "@client/src/runtime/command-dispatcher";
import type ArkadiaClient from "./ArkadiaClient";

export interface CommandHistoryState {
    history: string[];
    index: number;
    currentInput: string;
}

export interface SendMessageDependencies {
    dispatcher: CommandDispatcher;
    arkadiaClient: typeof ArkadiaClient;
    history: CommandHistoryState;
}

export function sendMessageFromInput(
    input: HTMLInputElement,
    { dispatcher, arkadiaClient, history }: SendMessageDependencies,
    focus = true,
): void {
    const message = input.value.trim();
    if (message) {
        const dispatched = dispatcher.sendCommand(message);
        if (!dispatched) {
            return;
        }
        if (arkadiaClient.hasReceivedFirstGmcp()) {
            const { history: entries } = history;
            if (entries.length === 0 || entries[entries.length - 1] !== message) {
                entries.push(message);
            }
            history.index = -1;
            history.currentInput = '';
            if (focus) {
                input.select();
            }
        } else {
            input.value = '';
        }
        return;
    }

    const dispatched = dispatcher.sendCommand('');
    if (dispatched && focus) {
        input.select();
    }
}

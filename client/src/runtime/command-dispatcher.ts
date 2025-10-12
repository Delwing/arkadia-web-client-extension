export interface CommandDispatcher {
    sendCommand(command: string, options?: { echo?: boolean }): void;
    sendEvent(type: string, payload?: unknown): void;
}

const noopDispatcher: CommandDispatcher = {
    sendCommand() {},
    sendEvent() {},
};

let currentDispatcher: CommandDispatcher = noopDispatcher;

export function setCommandDispatcher(dispatcher: CommandDispatcher) {
    currentDispatcher = dispatcher;
}

export function getCommandDispatcher(): CommandDispatcher {
    return currentDispatcher;
}

export function resetCommandDispatcherForTesting() {
    currentDispatcher = noopDispatcher;
}

import type { AnsiAwareBuffer } from "@client/ansi/FormatState.ts";
import type { MessageHandlerClient, OutputMessageHandler } from "@shared/dom/outputMessageHandler.ts";

type PendingMessage = [message?: string | AnsiAwareBuffer, type?: string, timestamp?: number];

/*
The game output's engine, as GameOutput sets it up when it mounts. The client
starts printing before the page renders (start-up notices, a resumed session's
replay), so what it says until then is held and shown, in order, the moment the
output area exists.
*/

let handler: OutputMessageHandler | null = null;
let pending: PendingMessage[] | null = null;
let stopBuffering: (() => void) | null = null;

/** Hold the client's messages until {@link attachOutputHandler}. Call once, at start-up. */
export function bufferOutputUntilMounted(client: MessageHandlerClient): void {
    if (handler || pending) return;
    pending = [];
    const listener = (...args: PendingMessage) => { pending?.push(args); };
    client.on("message", listener);
    stopBuffering = () => client.off("message", listener);
}

/** The output area is up: show what was held, then let the engine take the client's messages. */
export function attachOutputHandler(next: OutputMessageHandler): () => void {
    handler = next;
    stopBuffering?.();
    stopBuffering = null;
    const held = pending ?? [];
    pending = null;
    for (const args of held) next.appendMessage(...args);
    return () => {
        if (handler === next) handler = null;
    };
}

/** The engine, while the output area is mounted. */
export function getOutputHandler(): OutputMessageHandler | null {
    return handler;
}

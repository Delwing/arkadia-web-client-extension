import {parseAnsiPatterns} from './ansiParser';
import {RecordedEvent} from './recordingStorage';
import Recorder from './Recorder';
import {ClientAdapter} from "@client/src/Client.ts";
import type { ClientEvents } from "@client/src/runtime/client-events";
import { EventHub } from "@client/src/runtime/event-hub";
import type { EventHubSubscription } from "@client/src/runtime/event-hub";
import type { RuntimeEvents } from "@client/src/runtime/event-hub";
import {md5} from 'js-md5';
import type {
    TransportAdapter,
    TransportConnectOptions,
    TransportIn,
    TransportSubscription,
} from "@client/src/runtime/transport/types";
import MessageRouter from "@client/src/runtime/transport/message-router";
import { runtimeEventHub } from "@client/src/runtime/event-hub";
import WebSocketTransportAdapter from "./transport/websocket-adapter";

type Params<T> = T extends void ? [] : T extends any[] ? T : [T];
type EventListener<K extends keyof ClientEvents> = (...args: Params<ClientEvents[K]>) => void;

export interface ArkadiaClientDependencies {
    transport: TransportAdapter;
    router: MessageRouter;
    eventHub: EventHub<RuntimeEvents>;
}

function createRouter(transport: TransportAdapter) {
    return new MessageRouter(transport, runtimeEventHub, { parseAnsiPatterns });
}

class ArkadiaClient implements ClientAdapter {
    private transport: TransportAdapter;
    private router: MessageRouter;
    private transportSubscription?: TransportSubscription;
    private socketOpen = false;
    private lastConnectManual = true;
    private userCommand: string | null = null;
    private passwordCommand: string | null = null;
    private recorder: Recorder;
    private readonly events = new EventHub<ClientEvents>();
    private readonly listenerSubscriptions = new Map<keyof ClientEvents, Map<Function, EventHubSubscription>>();
    private runtimeEventHub: EventHub<RuntimeEvents>;
    private runtimeEventSubscriptions: EventHubSubscription[] = [];

    constructor(deps: ArkadiaClientDependencies) {
        this.transport = deps.transport;
        this.router = deps.router;
        this.runtimeEventHub = deps.eventHub;
        this.router.attach(this.transport);
        this.transportSubscription = this.transport.messages$.subscribe(this.handleTransportMessage);
        this.recorder = new Recorder({
            processIncomingData: (data) => this.router.processFrame(data),
            sendCommand: (command, echo = true) => this.send(command, echo),
            emit: (event, ...args) => this.emit(event as keyof ClientEvents, ...(args as any)),
        });

        this.subscribeToRuntimeEvents();

        addEventListener("beforeunload", (event) => {
            if (this.socketOpen) {
                event.preventDefault();
            }
        });
    }

    configure(deps: Partial<ArkadiaClientDependencies>) {
        let shouldResubscribe = false;

        if (deps.transport && deps.transport !== this.transport) {
            this.transportSubscription?.unsubscribe();
            this.transport = deps.transport;
            shouldResubscribe = true;
        }

        if (deps.router && deps.router !== this.router) {
            this.router.dispose();
            this.router = deps.router;
            shouldResubscribe = true;
        }

        if (deps.eventHub && deps.eventHub !== this.runtimeEventHub) {
            this.setRuntimeEventHub(deps.eventHub);
        }

        if (shouldResubscribe) {
            this.router.attach(this.transport);
            this.transportSubscription = this.transport.messages$.subscribe(this.handleTransportMessage);
        }
    }

    private handleTransportMessage = (message: TransportIn) => {
        switch (message.type) {
            case "open":
                this.socketOpen = true;
                this.router.reset();
                this.emit("open", message.event);
                this.emit("client.connect");
                if (!this.lastConnectManual && this.userCommand && this.passwordCommand) {
                    this.send(this.userCommand, false);
                    if (this.passwordCommand !== this.userCommand) {
                        this.send(this.passwordCommand, false);
                    }
                }
                break;
            case "close":
                this.socketOpen = false;
                this.emit("close", message.event);
                this.emit("client.disconnect");
                this.router.reset();
                break;
            case "error":
                this.emit("error", message.event);
                break;
            case "data":
                this.recorder.handleIncoming(message.payload);
                break;
        }
    };

    private setRuntimeEventHub(eventHub: RuntimeEventHub<RuntimeEvents>) {
        this.runtimeEventSubscriptions.forEach((subscription) => subscription.unsubscribe());
        this.runtimeEventSubscriptions = [];
        this.runtimeEventHub = eventHub;
        this.subscribeToRuntimeEvents();
    }

    private subscribeToRuntimeEvents() {
        this.runtimeEventSubscriptions.push(
            this.runtimeEventHub.on("message", (text) => {
                this.emit("message", text);
            }),
        );

        this.runtimeEventSubscriptions.push(
            this.runtimeEventHub.on("gmcp", ({ path, value }) => {
                this.emit("gmcp", { path, value });
                this.emit(`gmcp.${path}` as keyof ClientEvents, value as ClientEvents[keyof ClientEvents]);
            }),
        );

        this.runtimeEventSubscriptions.push(
            this.runtimeEventHub.on("gmcpMessage", ({ type, text }) => {
                this.emit(`gmcp_msg.${type}` as keyof ClientEvents, text as ClientEvents[keyof ClientEvents]);
            }),
        );

        this.runtimeEventSubscriptions.push(
            this.runtimeEventHub.on("outputFlushed", ({ count }) => {
                this.emit("output-sent", count as ClientEvents[keyof ClientEvents]);
            }),
        );

        this.runtimeEventSubscriptions.push(
            this.runtimeEventHub.on("lineSent", () => {
                this.emit("line-sent");
            }),
        );

        this.runtimeEventSubscriptions.push(
            this.runtimeEventHub.on("command", (command) => {
                this.emit("command", command as ClientEvents[keyof ClientEvents]);
            }),
        );
    }

    on<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
        const wrappers = this.listenerSubscriptions.get(event) ?? new Map();
        if (!this.listenerSubscriptions.has(event)) {
            this.listenerSubscriptions.set(event, wrappers);
        }

        const subscription = this.events.on(event, (payload) => {
            if (Array.isArray(payload)) {
                (listener as (...params: unknown[]) => void)(...payload);
                return;
            }
            if (payload !== undefined) {
                (listener as (param: unknown) => void)(payload);
                return;
            }
            (listener as () => void)();
        });

        wrappers.set(listener, subscription);
    }

    off<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
        const wrappers = this.listenerSubscriptions.get(event);
        const subscription = wrappers?.get(listener);
        if (!subscription) {
            return;
        }
        subscription.unsubscribe();
        wrappers!.delete(listener);
        if (wrappers && wrappers.size === 0) {
            this.listenerSubscriptions.delete(event);
        }
    }

    emit<K extends keyof ClientEvents>(event: K, ...args: Params<ClientEvents[K]>): void {
        const payload = args.length === 0 ? undefined : args.length === 1 ? args[0] : args;
        this.events.emit(event, payload as ClientEvents[K]);
    }

    connect(options?: TransportConnectOptions | boolean): void {
        const manual = typeof options === "boolean" ? options : options?.manual ?? true;
        this.lastConnectManual = manual;
        this.router.reset();
        this.transport.connect({ manual });
    }

    disconnect(): void {
        this.transport.disconnect();
        this.router.reset();
    }

    isSocketOpen(): boolean {
        return this.socketOpen;
    }

    hasReceivedFirstGmcp(): boolean {
        return this.router.hasReceivedFirstGmcp;
    }

    setStoredPassword(password: string | null): void {
        this.passwordCommand = password;
    }

    setStoredCharacter(character: string | null): void {
        this.userCommand = character;
    }

    sendRaw(message: string): void {
        if (!this.socketOpen) {
            console.error("WebSocket is not connected");
            return;
        }
        this.transport.send({ kind: "raw", payload: message });
    }

    send(message: string, echo: boolean = true): void {
        if (!this.socketOpen) {
            console.error("WebSocket is not connected");
            return;
        }

        if (!this.router.hasReceivedFirstGmcp) {
            if (!this.userCommand) {
                this.userCommand = message;
            }
            this.passwordCommand = message;
        }

        try {
            this.recorder.handleOutgoing(message);
            this.transport.send({ kind: "text", payload: message });
            if (echo && this.router.hasReceivedFirstGmcp && message) {
                this.output("→ " + message, "command");
            }
        } catch (error) {
            console.error("Error sending message:", error);
            const synthetic = new Event("error");
            (synthetic as any).detail = error;
            this.emit("error", synthetic);
        }
    }

    sendGmcp(path: string, payload: any = {}): void {
        if (!this.socketOpen) {
            return;
        }
        try {
            this.transport.send({ kind: "gmcp", path, payload });
        } catch (error) {
            console.error("Error sending GMCP message:", error);
            const synthetic = new Event("error");
            (synthetic as any).detail = error;
            this.emit("error", synthetic);
        }
    }

    setConfig(payload: any, filename: string) {
        const serialized = JSON.stringify(payload);
        const data = {
            data: payload,
            md5: md5(serialized),
            compressed: false,
            filename: filename,
        };
        this.sendGmcp('client.conf.set', data);
    }

    sendCommand(command: string, echo: boolean = true): void {
        this.send(command, echo);
    }

    output(text?: string, type?: string) {
        this.emit('message', text, type);
    }

    parseAnsiPatterns(text: string) {
        return parseAnsiPatterns(text);
    }

    flushMessageBuffer() {
        this.router.flushMessageBuffer();
    }

    startRecording(name: string) {
        this.recorder.startRecording(name);
    }

    async stopRecording(save?: boolean) {
        await this.recorder.stopRecording(save);
    }

    async loadRecording(name: string) {
        await this.recorder.loadRecording(name);
    }

    listRecordings() {
        return this.recorder.listRecordings();
    }

    deleteRecording(name: string) {
        return this.recorder.deleteRecording(name);
    }

    stopPlayback() {
        this.recorder.stopPlayback();
    }

    pausePlayback() {
        this.recorder.pausePlayback();
    }

    resumePlayback() {
        this.recorder.resumePlayback();
    }

    stepForward() {
        this.recorder.stepForward();
    }

    stepBack() {
        this.recorder.stepBack();
    }

    replayLast() {
        this.recorder.replayLast();
    }

    getRecordedMessages() {
        return this.recorder.getRecordedMessages();
    }

    setRecordedMessages(events: RecordedEvent[]) {
        this.recorder.setRecordedMessages(events);
    }

    replayRecordedMessages() {
        this.recorder.replayRecordedMessages();
    }

    replayRecordedMessagesTimed() {
        this.recorder.replayRecordedMessagesTimed();
    }
}

const defaultTransport = new WebSocketTransportAdapter();
const defaultRouter = createRouter(defaultTransport);
const legacyClient = new ArkadiaClient({ transport: defaultTransport, router: defaultRouter, eventHub: runtimeEventHub });

export function configureArkadiaClient(deps: Partial<ArkadiaClientDependencies>) {
    if (deps.transport || deps.router) {
        const transport = deps.transport ?? defaultTransport;
        const router = deps.router ?? createRouter(transport);
        legacyClient.configure({ transport, router });
    }
    if (deps.eventHub && deps.eventHub !== runtimeEventHub) {
        legacyClient.configure({ eventHub: deps.eventHub });
    }
    return legacyClient;
}

export function createArkadiaClient(deps?: Partial<ArkadiaClientDependencies>) {
    const transport = deps?.transport ?? new WebSocketTransportAdapter();
    const router = deps?.router ?? createRouter(transport);
    const eventHub = deps?.eventHub ?? runtimeEventHub;
    return new ArkadiaClient({ transport, router, eventHub });
}

export { ArkadiaClient };
export default legacyClient;

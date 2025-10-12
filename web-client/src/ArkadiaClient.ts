import {parseAnsiPatterns} from './ansiParser';
import {RecordedEvent} from './recordingStorage';
import Recorder from './Recorder';
import {ClientAdapter} from "@client/src/Client.ts";
import eventBus, {ClientEvents} from "@client/src/eventBus.ts";
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

    constructor(deps: ArkadiaClientDependencies) {
        this.transport = deps.transport;
        this.router = deps.router;
        this.router.attach(this.transport);
        this.transportSubscription = this.transport.messages$.subscribe(this.handleTransportMessage);
        this.recorder = new Recorder({
            processIncomingData: (data) => this.router.processFrame(data),
            sendCommand: (command, echo = true) => this.send(command, echo),
            emit: (event, ...args) => this.emit(event as keyof ClientEvents, ...(args as any)),
        });

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
                this.router.processFrame(message.payload);
                break;
        }
    };

    on<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
        eventBus.on(event, listener);
    }

    off<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
        eventBus.off(event, listener);
    }

    emit<K extends keyof ClientEvents>(event: K, ...args: Params<ClientEvents[K]>): void {
        eventBus.emit(event, ...args);
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
const legacyClient = new ArkadiaClient({ transport: defaultTransport, router: defaultRouter });

export function configureArkadiaClient(deps: Partial<ArkadiaClientDependencies>) {
    if (deps.transport || deps.router) {
        const transport = deps.transport ?? defaultTransport;
        const router = deps.router ?? createRouter(transport);
        legacyClient.configure({ transport, router });
    }
    return legacyClient;
}

export function createArkadiaClient(deps?: Partial<ArkadiaClientDependencies>) {
    const transport = deps?.transport ?? new WebSocketTransportAdapter();
    const router = deps?.router ?? createRouter(transport);
    return new ArkadiaClient({ transport, router });
}

export { ArkadiaClient };
export default legacyClient;

import {parseAnsiPatterns} from './ansiParser';
import {RecordedEvent} from './recordingStorage';
import Recorder from './Recorder';
import {ClientAdapter} from "@client/src/Client.ts";
import eventBus, {ClientEvents} from "@client/src/eventBus.ts";
import ProtocolHandler from './ProtocolHandler';
import ConnectionManager from './ConnectionManager';

type Params<T> = T extends void ? [] : T extends any[] ? T : [T];
type EventListener<K extends keyof ClientEvents> = (...args: Params<ClientEvents[K]>) => void;

class ArkadiaClient implements ClientAdapter {
    private connection: ConnectionManager;
    private protocol: ProtocolHandler;
    private recorder: Recorder;

    constructor(recorder: Recorder) {
        this.recorder = recorder;
        this.protocol = new ProtocolHandler(
            () => {},
            (ev, ...args) => this.emit(ev as any, ...args),
            () => this.connection.enableMccp()
        );
        this.connection = new ConnectionManager(this.protocol, this.recorder, (ev, ...args) => this.emit(ev as any, ...args));
        this.protocol.setSendRaw(this.connection.sendRaw.bind(this.connection));
    }

    on<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
        eventBus.on(event, listener);
    }

    off<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
        eventBus.off(event, listener);
    }

    emit<K extends keyof ClientEvents>(event: K, ...args: Params<ClientEvents[K]>): void {
        eventBus.emit(event, ...args);
    }

    connect(manual: boolean = true): void { this.connection.connect(manual); }
    disconnect(): void { this.connection.disconnect(); }
    isSocketOpen(): boolean { return this.connection.isSocketOpen(); }
    hasReceivedFirstGmcp(): boolean { return this.protocol.hasReceivedFirstGmcp(); }
    setStoredPassword(password: string | null): void { this.connection.setStoredPassword(password); }
    setStoredCharacter(character: string | null): void { this.connection.setStoredCharacter(character); }
    sendRaw(message: string): void { this.connection.sendRaw(message); }
    send(message: string, echo: boolean = true): void { this.connection.send(message, echo); }
    sendCommand(command: string, echo: boolean = true): void { this.send(command, echo); }
    sendGmcp(path: string, payload: any = {}): void { this.connection.sendGmcp(path, payload); }

    output(text?: string, type?: string) { this.emit('message', text, type); }
    parseAnsiPatterns(text: string) { return parseAnsiPatterns(text); }
    flushMessageBuffer() { this.protocol.flushMessageBuffer(); }
    processIncomingData(data: string) { this.protocol.processIncomingData(data); }

    startRecording(name: string) { this.recorder.startRecording(name); }
    async stopRecording(save?: boolean) { await this.recorder.stopRecording(save); }
    async loadRecording(name: string) { await this.recorder.loadRecording(name); }
    listRecordings() { return this.recorder.listRecordings(); }
    deleteRecording(name: string) { return this.recorder.deleteRecording(name); }
    stopPlayback() { this.recorder.stopPlayback(); }
    pausePlayback() { this.recorder.pausePlayback(); }
    resumePlayback() { this.recorder.resumePlayback(); }
    stepForward() { this.recorder.stepForward(); }
    stepBack() { this.recorder.stepBack(); }
    replayLast() { this.recorder.replayLast(); }
    getRecordedMessages() { return this.recorder.getRecordedMessages(); }
    setRecordedMessages(events: RecordedEvent[]) { this.recorder.setRecordedMessages(events); }
    replayRecordedMessages() { this.recorder.replayRecordedMessages(); }
    replayRecordedMessagesTimed() { this.recorder.replayRecordedMessagesTimed(); }
}

const recorder = new Recorder({
    processIncomingData: () => {},
    sendCommand: () => {},
    emit: () => {}
});

const client = new ArkadiaClient(recorder);

recorder.setHooks({
    processIncomingData: (d) => client.processIncomingData(d),
    sendCommand: (cmd, echo) => client.sendCommand(cmd, echo),
    emit: (ev, ...args) => client.emit(ev as any, ...args)
});

export default client;

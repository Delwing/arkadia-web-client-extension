import {RecordedEvent, getRecording} from './recordingStorage';
import Recorder from './Recorder';
import Client, {ClientAdapter} from "@client/Client";
import eventBus from "@modules/core/eventBus";
import type {ClientEvents} from "@shared/events";
import {globalStorage} from "@modules/core/storage";
import {CommandOptions, normalizeCommand} from "@client/scripts/commandPreserveCaseMode";
import PingTracker from "./PingTracker";
import {getClientInstance} from "@shared/runtime";
import {
    createGmcpStream,
    createTelnetOptionParser,
    encodeGmcp,
    MccpHandler,
    stripTelnetSequences,
} from "@shared/socket";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";

type Params<T> = [T] extends [void]
    ? []
    : [T] extends [any[]]
        ? T
        : [T];
type EventListener<K extends keyof ClientEvents> = (...args: Params<ClientEvents[K]>) => void;

// WebSocket configuration
const WEBSOCKET_URL = 'wss://arkadia.rpg.pl/wss';
const LAST_SESSION_RECORDING_NAME = 'Ostatnia sesja (auto)';


class ArkadiaClient implements ClientAdapter {
    private socket!: WebSocket;
    private receivedFirstGmcp: boolean = false;
    private pingTracker: PingTracker;
    private messageBuffer: { text: string, type: string }[] = []
    private readonly gmcpStream: (data: string) => void;
    private readonly telnetOptionHandler: (optionData: string) => string;
    private readonly mccpHandler: MccpHandler;
    private recorder: Recorder;
    private autoRecorder: Recorder | null = null;
    private readonly activeRecorders = new Set<Recorder>();
    private readonly autoRecordingName = LAST_SESSION_RECORDING_NAME;
    private autoLowercaseCommands: boolean = false;
    private commandEcho: boolean = true;

    constructor() {
        this.pingTracker = new PingTracker(() => this.sendGmcp('core.ping'));
        this.gmcpStream = createGmcpStream({
            onEnvelope: ({path, value}) => {
                if (path === "char.info" && !this.receivedFirstGmcp) {
                    this.receivedFirstGmcp = true;
                    this.maybeStartAutoRecording();
                }
                this.emit(`gmcp.${path}`, value);
                this.emit('gmcp', {path, value});
            },
            onMessage: (text, type) => {
                this.messageBuffer.push({text, type});
            },
            onFirstCharInfo: () => {
                if (!this.receivedFirstGmcp) {
                    this.receivedFirstGmcp = true;
                    this.maybeStartAutoRecording();
                }
            },
        });
        this.telnetOptionHandler = createTelnetOptionParser(this.gmcpStream);
        this.mccpHandler = new MccpHandler((data) => this.sendRaw(data));
        this.recorder = this.createRecorder(false);
        addEventListener("beforeunload", (event) => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                event.preventDefault();
            }
        })

        // Listen for UI settings changes
        const initialUiSettings = globalStorage.get('uiSettings');
        if (initialUiSettings) {
            if (typeof initialUiSettings.autoLowercaseCommands === 'boolean') {
                this.autoLowercaseCommands = initialUiSettings.autoLowercaseCommands;
            }
            if (typeof initialUiSettings.commandEcho === 'boolean') {
                this.commandEcho = initialUiSettings.commandEcho;
            }
        }
        globalStorage.onChange('uiSettings', (settings) => {
            if (typeof settings?.autoLowercaseCommands === 'boolean') {
                this.autoLowercaseCommands = settings.autoLowercaseCommands;
            }
            if (typeof settings?.commandEcho === 'boolean') {
                this.commandEcho = settings.commandEcho;
            }
        });
    }


    /**
     * Register an event listener
     */
    on<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
        eventBus.on(event, listener);
    }

    /**
     * Remove an event listener
     */
    off<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
        eventBus.off(event, listener);
    }

    /**
     * Emit an event to all registered listeners
     */
    emit<K extends keyof ClientEvents>(event: K, ...args: Params<ClientEvents[K]>): void {
        eventBus.emit(event, ...args);
    }

    /**
     * Connect to the WebSocket server
     */
    connect(): void {
        try {
            // Reset the flag when connecting
            this.receivedFirstGmcp = false;
            this.socket = new WebSocket(WEBSOCKET_URL, []);
            this.socket.onmessage = (event: MessageEvent<string>) => {
                try {
                    if (event.data.length === 0) return;
                    const decodedData = atob(event.data);
                    // Decompress MCCP data before any other processing
                    const data = this.mccpHandler.processData(decodedData);
                    this.recordIncoming(data);
                    try {
                        this.processIncomingData(data);
                    } catch (processingError) {
                        console.error('Error during trigger processing:', processingError);
                        console.error('Line was recorded but not processed:', data.substring(0, 100));
                    }
                } catch (error) {
                    console.error('Error processing incoming message:', error);
                }
            };

            this.socket.onerror = (error: Event) => {
                this.emit('error', error);
            };

            this.socket.onclose = (event: CloseEvent) => {
                this.emit('close', event);
                this.emit('client.disconnect');
                this.pingTracker.stop();
                this.mccpHandler.reset();

                void this.stopAutoRecording(true);
            };

            this.socket.onopen = (event: Event) => {
                this.emit('open', event);
                this.emit('client.connect');
                this.pingTracker.start();
            };
        } catch (error) {
            this.emit('error', error);
        }
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect(): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
        this.pingTracker.stop();
    }

    /**
     * Check if the WebSocket is currently open
     */
    isSocketOpen(): boolean {
        return !!this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    /**
     * Returns true when history/echo should be active:
     * available before connection, disabled after connect until gmcp.char.info
     */
    hasReceivedFirstGmcp(): boolean {
        return !this.isSocketOpen() || this.receivedFirstGmcp;
    }

    /**
     * Returns true if command echo is enabled in UI settings
     */
    isCommandEchoEnabled(): boolean {
        return this.commandEcho;
    }

    /**
     * Send a message through the WebSocket
     */
    send(message: string, echo: boolean = true, options?: CommandOptions): void {
        const shouldEcho = echo && this.commandEcho;
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            if (shouldEcho && message) {
                this.output("→ " + message, 'command');
            }
            return;
        }

        if (this.receivedFirstGmcp) {
            // Pass autoLowercaseCommands setting to normalizeCommand
            const normalizeOptions = {
                ...options,
                autoLowercaseCommands: this.autoLowercaseCommands
            };
            message = normalizeCommand(message, normalizeOptions)
            this.recordOutgoing(message);
        }

        try {
            this.socket.send(btoa(message + "\r\n"));
            // Only echo commands if requested and we've received the first GMCP event
            if (shouldEcho && this.receivedFirstGmcp && message) {
                this.output("→ " + message, 'command');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.emit('error', error);
        }
    }

    /**
     * Send raw telnet data (no \r\n suffix, just base64 encode and send).
     * Used for telnet option negotiation responses like MCCP.
     */
    private sendRaw(data: string): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            this.socket.send(btoa(data));
        } catch (error) {
            console.error('Error sending raw data:', error);
        }
    }

    sendGmcp(path: string, payload: any = {}): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            const gmcpMessage = encodeGmcp(path, payload);
            this.socket.send(btoa(gmcpMessage));
        } catch (error) {
            console.error('Error sending GMCP message:', error);
            this.emit('error', error);
        }
    }

    output(text?: string | AnsiAwareBuffer, type?: string, timestamp?: number) {
        const ts = typeof timestamp === 'number' ? timestamp : Date.now();
        this.emit('message', text, type, ts)
    }

    /**
     * Process incoming WebSocket data by removing telnet options
     */
    private processIncomingData(data: string, options?: { timestamp?: number }) {
        const sanitized = stripTelnetSequences(data, this.telnetOptionHandler);
        if (sanitized.length > 0) {
            const timestamp = typeof options?.timestamp === 'number' ? options.timestamp : Date.now();
            this.emit('message', sanitized, undefined, timestamp)
        }
        this.flushMessageBuffer()
    }

    flushMessageBuffer() {
        let groupCount = 0;
        let currentType: string | null = null;
        let currentText = "";

        const flushCurrentGroup = () => {
            if (currentType === null) {
                return;
            }

            this.sendLine(currentText, currentType);
            groupCount += 1;
            currentType = null;
            currentText = "";
        }

        this.messageBuffer.forEach((message) => {
            if (message.type === currentType) {
                currentText += message.text;
            } else {
                flushCurrentGroup();
                currentType = message.type;
                currentText = message.text;
            }
        });

        flushCurrentGroup();

        this.emit('output-sent', groupCount);
        this.messageBuffer = []
    }

    private sendLine(text: string, type: string) {
        const client = getClientInstance<Client>();
        if (client) {
            const parts = client.onLine(text, type);
            parts.forEach((part) => {
                eventBus.on('output-sent', () => this.emit(`gmcp_msg.${type}`, part), {once: true})
                this.output(part, type);
            })

        }
    }

    // -- RECORDER -- //

    getRecorder(): Recorder {
        return this.recorder;
    }

    startRecording(name: string) {
        if (this.activeRecorders.has(this.recorder)) {
            this.unregisterRecorder(this.recorder);
        }
        const recorder = this.createRecorder(false);
        this.recorder = recorder;
        this.registerRecorder(recorder);
        recorder.startRecording(name);
    }

    async stopRecording(save?: boolean) {
        if (!this.activeRecorders.has(this.recorder)) {
            return;
        }
        await this.recorder.stopRecording(save);
        this.unregisterRecorder(this.recorder);
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

    startOver() {
        this.recorder.startOver();
    }

    setLoopStart() {
        this.recorder.setLoopStart();
    }

    setLoopEnd() {
        this.recorder.setLoopEnd();
    }

    toggleLoop() {
        this.recorder.toggleLoop();
    }

    clearLoop() {
        this.recorder.clearLoop();
    }

    getLoopState() {
        return this.recorder.getLoopState();
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

    setPlaybackSpeed(speed: number) {
        this.recorder.setPlaybackSpeed(speed);
    }

    getPlaybackSpeed() {
        return this.recorder.getPlaybackSpeed();
    }

    private maybeStartAutoRecording() {
        if (this.autoRecorder && this.autoRecorder.isRecordingActive()) return;
        const recorder = this.createRecorder(true);
        this.autoRecorder = recorder;
        this.registerRecorder(recorder);
        recorder.startRecording(this.autoRecordingName);
    }

    private recordIncoming(data: string) {
        this.activeRecorders.forEach(recorder => {
            try {
                recorder.handleIncoming(data);
            } catch (error) {
                console.error('Error recording incoming data:', error);
            }
        });
    }

    private recordOutgoing(message: string) {
        this.activeRecorders.forEach(recorder => {
            try {
                recorder.handleOutgoing(message);
            } catch (error) {
                console.error('Error recording outgoing data:', error);
            }
        });
    }

    private createRecorder(auto: boolean) {
        const recorder = new Recorder({
            processIncomingData: (d, opts) => this.processIncomingData(d, opts),
            sendCommand: (cmd, echo, options) => this.send(cmd, echo, options),
            emit: (ev, ...args) => this.emitRecorderEvent(auto, recorder, ev, ...args),
            getCurrentMapLocation: () => {
                const ext = getClientInstance();
                const id = ext?.Map?.currentRoom?.id;
                return typeof id === 'number' ? id : null;
            },
            setMapLocationSilently: (locationId: number) => {
                const map = getClientInstance()?.Map;
                if (!map || typeof locationId !== 'number') {
                    return;
                }
                if (typeof map.renderRoomByIdSilently === 'function') {
                    map.renderRoomByIdSilently(locationId);
                    return;
                }
                if (typeof map.renderRoomById === 'function') {
                    map.renderRoomById(locationId, false);
                }
            }
        });
        return recorder;
    }

    private registerRecorder(recorder: Recorder) {
        this.activeRecorders.add(recorder);
    }

    private unregisterRecorder(recorder: Recorder) {
        this.activeRecorders.delete(recorder);
        if (this.autoRecorder === recorder) {
            this.autoRecorder = null;
        }
    }

    private emitRecorderEvent(auto: boolean, recorder: Recorder, event: string, ...args: any[]) {
        if (auto) {
            if (event === 'recording.start') {
                this.emit('recording.auto.start', recorder.getCurrentRecordingName());
                return;
            }
            if (event === 'recording.stop') {
                this.emit('recording.auto.stop', recorder.getCurrentRecordingName(), ...args);
            }
        }
        (this.emit as (...emitArgs: any[]) => void)(event as keyof ClientEvents, ...args);
    }

    private async stopAutoRecording(save?: boolean) {
        if (!this.autoRecorder || !this.activeRecorders.has(this.autoRecorder)) {
            this.autoRecorder = null;
            return;
        }
        const recorder = this.autoRecorder;
        this.unregisterRecorder(recorder);
        try {
            await recorder.stopRecording(save);
        } catch (error) {
            console.error('Failed to stop auto recording:', error);
        }
    }

    getActiveRecordingName() {
        if (this.recorder.isRecordingActive()) {
            return this.recorder.getCurrentRecordingName();
        }
        return null;
    }

    getAutoRecordingName() {
        if (this.autoRecorder && this.autoRecorder.isRecordingActive()) {
            return this.autoRecorder.getCurrentRecordingName();
        }
        return null;
    }

    async getRecordingSnapshot(name: string, options?: { recentMs?: number }): Promise<RecordedEvent[] | null> {
        const recorder = this.findRecorderByName(name);
        if (recorder) {
            if (options?.recentMs) {
                return recorder.getRecordedMessagesSince(options.recentMs);
            }
            return recorder.getRecordedMessages();
        }
        try {
            const events = await getRecording(name);
            if (events && options?.recentMs) {
                return this.filterRecentEvents(events, options.recentMs);
            }
            return events;
        } catch (error) {
            console.error('Failed to read recording snapshot:', error);
            return null;
        }
    }

    private findRecorderByName(name: string) {
        for (const recorder of this.activeRecorders) {
            if (recorder.getCurrentRecordingName && recorder.getCurrentRecordingName() === name) {
                return recorder;
            }
        }
        return null;
    }

    private filterRecentEvents(events: RecordedEvent[], durationMs: number) {
        const cutoff = Date.now() - durationMs;
        return events.filter(event => typeof event.timestamp === 'number' && event.timestamp >= cutoff);
    }

}

export default new ArkadiaClient();

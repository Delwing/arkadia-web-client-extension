import {parseAnsiPatterns} from './ansiParser';
import {RecordedEvent, getRecording} from './recordingStorage';
import Recorder from './Recorder';
import {ClientAdapter} from "@client/src/Client.ts";
import eventBus, {ClientEvents} from "@client/src/eventBus.ts";
import {CommandOptions, normalizeCommand} from "@client/src/scripts/commandPreserveCaseMode.ts";
import PingTracker from "./PingTracker.ts";
import { getClientInstance } from "./clientRegistry";

type Params<T> = [T] extends [void]
    ? []
    : [T] extends [any[]]
        ? T
        : [T];
type EventListener<K extends keyof ClientEvents> = (...args: Params<ClientEvents[K]>) => void;

// WebSocket configuration
const WEBSOCKET_URL = 'wss://arkadia.rpg.pl/wss';
const GMCP_COMMAND_CODE = 201;
const TELNET_OPTION_REGEX = /\u00FF\u00FA.*?\u00FF\u00F0|\u00FF.[^\u00FF]/g;
const LAST_SESSION_RECORDING_NAME = 'Ostatnia sesja (auto)';


class ArkadiaClient implements ClientAdapter {
    private socket!: WebSocket;
    private receivedFirstGmcp: boolean = false;
    private pingTracker: PingTracker;
    private messageBuffer: { text: string, type: string }[] = []
    private readonly telnetOptionHandler: (optionData: string) => string;
    private recorder: Recorder;
    private autoRecorder: Recorder | null = null;
    private readonly activeRecorders = new Set<Recorder>();
    private readonly autoRecordingName = LAST_SESSION_RECORDING_NAME;

    constructor() {
        this.pingTracker = new PingTracker(() => this.sendGmcp('core.ping'));
        this.telnetOptionHandler = this.parseTelnetOption.bind(this);
        this.recorder = this.createRecorder(false);
        addEventListener("beforeunload", (event) => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                event.preventDefault();
            }
        })
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
                    this.processIncomingData(decodedData);
                    this.recordIncoming(decodedData);
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
     * Check if the first GMCP event has been received
     */
    hasReceivedFirstGmcp(): boolean {
        return this.receivedFirstGmcp;
    }

    /**
     * Send a message through the WebSocket
     */
    send(message: string, echo: boolean = true, options?: CommandOptions): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket is not connected');
            return;
        }

        if (this.receivedFirstGmcp) {
            message = normalizeCommand(message, options)
            this.recordOutgoing(message);
        }

        try {
            this.socket.send(btoa(message + "\r\n"));
            // Only echo commands if requested and we've received the first GMCP event
            if (echo && this.receivedFirstGmcp && message) {
                this.output("→ " + message, 'command');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.emit('error', error);
        }
    }

    sendGmcp(path: string, payload: any = {}): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
            const gmcpMessage = `\xFF\xFA${String.fromCharCode(GMCP_COMMAND_CODE)}${path} ${data}\xFF\xF0`;
            this.socket.send(btoa(gmcpMessage));
        } catch (error) {
            console.error('Error sending GMCP message:', error);
            this.emit('error', error);
        }
    }

    output(text?: string, type?: string, timestamp?: number) {
        const ts = typeof timestamp === 'number' ? timestamp : Date.now();
        this.emit('message', text, type, ts)
    }

    getRecorder(): Recorder {
        return this.recorder;
    }

    setStoredPassword(_password: string | null): void {
        void _password;
        // Intentionally no-op; kept for API compatibility.
    }

    setStoredCharacter(_character: string | null): void {
        void _character;
        // Intentionally no-op; kept for API compatibility.
    }

    //Should be done on all ouput
    parseAnsiPatterns(text: string) {
        return parseAnsiPatterns(text)
    }

    /**
     * Process incoming WebSocket data by removing telnet options
     */
    private processIncomingData(data: string, options?: { timestamp?: number }) {
        const leftOver = data.replace(TELNET_OPTION_REGEX, this.telnetOptionHandler)
        const sanitized = leftOver.replace(/[ÿù]/g, "");
        if (sanitized.length > 0) {
            const timestamp = typeof options?.timestamp === 'number' ? options.timestamp : Date.now();
            this.emit('message', sanitized, undefined, timestamp)
        }
        this.flushMessageBuffer()
    }

    /**
     * Parse telnet option from incoming data
     */
    private parseTelnetOption(optionData: string): string {
        if (optionData.length === 3) {
            //Nothing to do at the moment
        } else {
            this.parseTelnetSubnegotiation(optionData.substring(2, optionData.length - 2));
        }
        return "";
    }

    /**
     * Parse telnet subnegotiation, specifically GMCP (Generic MUD Communication Protocol)
     */
    private parseTelnetSubnegotiation(data: string): void {
        if (data.length === 0) return;

        const firstChar = data.charCodeAt(0);

        if (firstChar === GMCP_COMMAND_CODE) {
            const gmcpData = data.substring(1);
            if (!gmcpData.length) return;

            const spaceIndex = gmcpData.indexOf(" ");
            if (spaceIndex === -1) return;

            const type = gmcpData.substring(0, spaceIndex).toLowerCase();
            let payload = gmcpData.substring(spaceIndex + 1);

            // Handle special case for gmcp_msgs
            if (type === "gmcp_msgs") {
                payload = payload.replace(//g, "\\u001B");
            }

            try {
                const gmcp = JSON.parse(payload);
                const isFirstGmcpEvent = type === "char.info" && !this.receivedFirstGmcp;
                this.receivedFirstGmcp = this.receivedFirstGmcp || type === "char.info";
                if (isFirstGmcpEvent) {
                    this.maybeStartAutoRecording();
                }
                if (type === "gmcp_msgs") {
                    let text = atob(gmcp.text)
                    this.messageBuffer.push({text, type: gmcp.type})
                } else {
                    this.emit(`gmcp.${type}`, gmcp);
                    this.emit('gmcp', {path: type, value: gmcp});
                }
            } catch (error) {
                console.error('Error parsing GMCP JSON:', error);
            }
        }
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
        const client = getClientInstance();
        if (client) {
            text = client.onLine(text, type);
        }
        eventBus.on('output-sent', () => this.emit(`gmcp_msg.${type}`, text), {once: true})
        this.emit("message", parseAnsiPatterns(text), type);
        this.emit('line-sent')
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
        this.activeRecorders.forEach(recorder => recorder.handleIncoming(data));
    }

    private recordOutgoing(message: string) {
        this.activeRecorders.forEach(recorder => recorder.handleOutgoing(message));
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

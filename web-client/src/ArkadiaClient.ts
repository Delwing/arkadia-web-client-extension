import {parseAnsiPatterns} from './ansiParser';
import {RecordedEvent} from './recordingStorage';
import Recorder from './Recorder';
import {ClientAdapter} from "@client/src/Client.ts";
import eventBus, {ClientEvents} from "@client/src/eventBus.ts";
import TelnetOptionNegotiation from "./TelnetOptionNegotiation.ts";
import {md5} from 'js-md5';
import {uncompress} from "./compression.ts";

type Params<T> = T extends void ? [] : T extends any[] ? T : [T];
type EventListener<K extends keyof ClientEvents> = (...args: Params<ClientEvents[K]>) => void;

// WebSocket configuration
const WEBSOCKET_URL = 'wss://arkadia.rpg.pl/wss';
const GMCP_COMMAND_CODE = 201;
const MCCP_COMMAND_CODE = 86;
const TELNET_OPTION_REGEX = /\u00FF\u00FA.*?\u00FF\u00F0|\u00FF.[^\u00FF]/g;


class ArkadiaClient implements ClientAdapter {
    private socket!: WebSocket;
    private telnetNegotiator = new TelnetOptionNegotiation(this)
    private mccp = false;
    // @ts-ignore
    private readInflator = new pako.Inflate()
    private receivedFirstGmcp: boolean = false;
    private userCommand: string | null = null;
    private passwordCommand: string | null = null;
    private lastConnectManual = true;
    private pingTimer: number | null = null;
    private messageBuffer: { text: string, type: string }[] = []
    private recorder = new Recorder({
        processIncomingData: (d) => this.processIncomingData(d),
        sendCommand: (cmd) => this.sendCommand(cmd),
        emit: (ev, ...args) => this.emit(ev, ...args),
        output: (text, type) => this.output(text, type)
    });

    constructor() {
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
    connect(manual: boolean = true): void {
        try {
            // Reset the flag when connecting
            this.receivedFirstGmcp = false;
            this.lastConnectManual = manual;
            this.socket = new WebSocket(WEBSOCKET_URL, []);
            this.socket.onmessage = (event: MessageEvent<string>) => {
                try {
                    const decodedData = this.inflate(atob(event.data));
                    this.recorder.handleIncoming(decodedData);
                    this.processIncomingData(decodedData);
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
                this.stopPing();

                // @ts-ignore
                this.readInflator = new pako.Inflate()
            };

            this.socket.onopen = (event: Event) => {
                this.emit('open', event);
                this.emit('client.connect');
                this.mccp = false;
                this.startPing();
                if (!this.lastConnectManual && this.userCommand && this.passwordCommand) {
                    this.send(this.userCommand, false);
                    if (this.passwordCommand !== this.userCommand) {
                        this.send(this.passwordCommand, false);
                    }
                }
            };
        } catch (error) {
            this.emit('error', error);
        }
    }

    private inflate(decodedData: string) {
        if (this.mccp) {
            try {
                const byteArray = decodedData.split("").map(function (char) {
                    return char.charCodeAt(0);
                });
                this.readInflator.push(byteArray, 2);
                if (this.readInflator.err) {
                    console.error("MCCP decompression error: " + this.readInflator.msg);
                    return decodedData;
                }
                const decompressed = new Uint16Array(this.readInflator.result);
                const length = decompressed.length;
                decodedData = "";
                for (let i = 0; i < length; i++) {
                    decodedData += String.fromCharCode(decompressed[i]);
                }
                this.readInflator.chunks = []
                this.readInflator.ended = false;
            } catch (error) {
                console.log("MCCP decompression error: " + error.message);
            }
        }
        return decodedData;
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect(): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
        this.mccp = false;
        this.stopPing();
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
     * Manually set the stored password for automatic credential sending
     */
    setStoredPassword(password: string | null): void {
        this.passwordCommand = password;
    }

    /**
     * Manually set the stored character for automatic credential sending
     */
    setStoredCharacter(character: string | null): void {
        this.userCommand = character;
    }

    sendRaw(message: string): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket is not connected');
            return;
        }
        try {
            this.socket.send(message);
        } catch (error) {
            console.error('Error sending message:', error);
            this.emit('error', error);
        }
    }

    /**
     * Send a message through the WebSocket
     */
    send(message: string, echo: boolean = true): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket is not connected');
            return;
        }

        if (!this.receivedFirstGmcp) {
            if (!this.userCommand) {
                this.userCommand = message;
            }
            this.passwordCommand = message;
        }

        try {
            this.recorder.handleOutgoing(message);
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

    setConfig(payload: any, filename: string) {
        const serialized = JSON.stringify(payload)
        const data = {
            data: payload,
            md5: md5(serialized),
            compressed: false,
            filename: filename,
        }
        this.sendGmcp('client.conf.set', data)
    }

    private startPing() {
        this.stopPing();
        this.sendGmcp('core.ping');
        this.pingTimer = window.setInterval(() => this.sendGmcp('core.ping'), 30000);
    }

    private stopPing() {
        if (this.pingTimer !== null) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    /**
     * Compatibility wrapper matching old client API
     */
    sendCommand(command: string, echo: boolean = true): void {
        this.send(command, echo);
    }

    output(text?: string, type?: string) {
        this.emit('message', text, type)
    }

    //Should be done on all ouput
    parseAnsiPatterns(text: string) {
        return parseAnsiPatterns(text)
    }

    /**
     * Process incoming WebSocket data by removing telnet options
     */
    private processIncomingData(data: string) {
        const leftOver = data.replace(TELNET_OPTION_REGEX, this.parseTelnetOption.bind(this)).trim();
        const sanitized = leftOver.replace(/[ÿù]/g, "");
        if (sanitized.length > 0) {
            this.emit('message', sanitized)
        }
        this.flushMessageBuffer()
    }

    /**
     * Parse telnet option from incoming data
     */
    private parseTelnetOption(optionData: string): string {
        if (optionData.length === 3) {
            //this.telnetNegotiator.parseOptionNegotiation(optionData)
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
        if (firstChar === MCCP_COMMAND_CODE) {
            this.mccp = true;
            console.log("MCCP enabled")
        }

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
                this.receivedFirstGmcp = this.receivedFirstGmcp || type === "char.info";
                if (type === "gmcp_msgs") {
                    let text = atob(gmcp.text)
                    this.messageBuffer.push({text, type: gmcp.type})
                } else if (type === "client.conf.get") {
                    const data = JSON.parse(uncompress(gmcp.data))
                    const filename = gmcp.filename
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
        let processed = [];
        this.messageBuffer.forEach((message, i) => {
            if (processed[processed.length - 1]?.type === message.type) {
                processed[processed.length - 1].text += message.text
            } else {
                processed.push(message)
            }
        })
        processed.forEach((message, i) => {
            this.sendLine(message.text, message.type, i)
        })
        this.emit('output-sent', processed.length)
        this.messageBuffer = []
    }

    private sendLine(text: string, type: string, i: number) {
        text = window.clientExtension.onLine(text, type)
        eventBus.on('output-sent', () => this.emit(`gmcp_msg.${type}`, text), {once: true})
        Output.send(parseAnsiPatterns(text), type);
        this.emit('line-sent')
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

export default new ArkadiaClient();

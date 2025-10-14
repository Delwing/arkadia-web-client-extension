import {parseAnsiPatterns} from './ansiParser';
import Recorder from './Recorder';
import {ClientAdapter} from "@client/src/Client.ts";
import type {ClickCallbackMap} from "@client/src/OutputHandler.ts";
import {md5} from 'js-md5';
import {uncompress} from "./compression.ts";
import WebSocketTransportAdapter from "@client/src/transport/websocket-adapter.ts";
import appEventBus from "@client/src/events/app-event-bus.ts";

// WebSocket configuration
const GMCP_COMMAND_CODE = 201;
const MCCP_COMMAND_CODE = 86;
const TELNET_OPTION_REGEX = /\u00FF\u00FA.*?\u00FF\u00F0|\u00FF.[^\u00FF]/g;


export default class ArkadiaClient implements ClientAdapter {
    private websocketAdapter: WebSocketTransportAdapter;
    private receivedFirstGmcp: boolean = false;
    private mccp: boolean = false;
    private messageBuffer: { text: string, type: string }[] = []
    readonly recorder: Recorder

    constructor(websocketAdapter: WebSocketTransportAdapter) {
        this.websocketAdapter = websocketAdapter
        this.websocketAdapter.messages$.subscribe((message) => {
            switch (message.type) {
                case 'close':
                    appEventBus.emit('client.disconnect')
                    break
                case "open":
                    appEventBus.emit('client.connect')
                    this.receivedFirstGmcp = false;
                    break
                case "data":
                    this.processIncomingData(message.payload)
                    break
                case "error":
                    console.error("Websocket error")
                    break
            }
        })

        appEventBus.on('output', (event) => {
            this.output(event.message, event.type, event.clickCallbacks)
        })
    }

    /**
     * Connect to the WebSocket server
     */
    connect(): void {
        this.websocketAdapter.connect()
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect(): void {
        this.websocketAdapter.disconnect()
    }

    /**
     * Check if the WebSocket is currently open
     */
    isConnected(): boolean {
        return this.websocketAdapter.isConnected();
    }

    /**
     * Check if the first GMCP event has been received
     */
    hasReceivedFirstGmcp(): boolean {
        return this.receivedFirstGmcp;
    }

    sendRaw(message: string): void {
        this.websocketAdapter.send(message)
    }

    /**
     * Send a message through the WebSocket
     */
    send(message: string, echo: boolean = true): void {
        try {
            this.websocketAdapter.send(message);
            // Only echo commands if requested and we've received the first GMCP event
            if (echo && this.receivedFirstGmcp && message) {
                this.output("→ " + message, 'command');
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    sendGmcp(path: string, payload: any = {}): void {
        this.websocketAdapter.sendGmcp(path, payload)
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

    output(text?: string, type?: string, clickCallbacks?: ClickCallbackMap) {
        const parsed = typeof text === 'string' ? this.parseAnsiPatterns(text) : text
        appEventBus.emit('message', {text: parsed, type: type, callbackMap: clickCallbacks})
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
            appEventBus.emit('message', {text: sanitized, type: "raw"})
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
                    appEventBus.emit(`gmcp.${type}`, gmcp);
                    appEventBus.emit('gmcp', {path: type, value: gmcp});
                }
            } catch (error) {
                console.error('Error parsing GMCP JSON:', error);
            }
        }
    }

    flushMessageBuffer() {
        let processed: { text: string, type: string }[] = [];
        //todo maybe add to buffer here
        this.messageBuffer.forEach((message) => {
            if (processed[processed.length - 1]?.type === message.type) {
                processed[processed.length - 1].text += message.text
            } else {
                processed.push(message)
            }
        })
        processed.forEach((message) => {
            appEventBus.emit('line', message)
            appEventBus.once('output-sent', () => appEventBus.emit(`gmcp_msg.${message.type}`, message.text))
        })
        this.messageBuffer = []
        appEventBus.emit('output-sent')
    }

}


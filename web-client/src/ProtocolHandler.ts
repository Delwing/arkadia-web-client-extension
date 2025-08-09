import {parseAnsiPatterns} from './ansiParser';
import TelnetOptionNegotiation from './TelnetOptionNegotiation.ts';
import eventBus from "@client/src/eventBus.ts";

const GMCP_COMMAND_CODE = 201;
const MCCP_COMMAND_CODE = 86;
const TELNET_OPTION_REGEX = /\u00FF\u00FA.*?\u00FF\u00F0|\u00FF.[^\u00FF]/g;

export default class ProtocolHandler {
    private telnetNegotiator: TelnetOptionNegotiation;
    private messageBuffer: { text: string, type: string }[] = [];
    private receivedFirstGmcp = false;

    constructor(
        sendRaw: (data: string) => void,
        private emit: (event: string, ...args: any[]) => void,
        private enableMccp: () => void,
    ) {
        this.telnetNegotiator = new TelnetOptionNegotiation(sendRaw);
    }

    setSendRaw(sendRaw: (data: string) => void) {
        this.telnetNegotiator = new TelnetOptionNegotiation(sendRaw);
    }

    hasReceivedFirstGmcp() {
        return this.receivedFirstGmcp;
    }

    processIncomingData(data: string) {
        const leftOver = data.replace(TELNET_OPTION_REGEX, this.parseTelnetOption.bind(this)).trim();
        const sanitized = leftOver.replace(/[ÿù]/g, "");
        if (sanitized.length > 0) {
            this.emit('message', sanitized);
        }
        this.flushMessageBuffer();
    }

    private parseTelnetOption(optionData: string): string {
        if (optionData.length === 3) {
            //this.telnetNegotiator.parseOptionNegotiation(optionData);
        } else {
            this.parseTelnetSubnegotiation(optionData.substring(2, optionData.length - 2));
        }
        return "";
    }

    private parseTelnetSubnegotiation(data: string) {
        if (data.length === 0) return;
        const firstChar = data.charCodeAt(0);
        if (firstChar === MCCP_COMMAND_CODE) {
            this.enableMccp();
            console.log("MCCP enabled");
        }
        if (firstChar === GMCP_COMMAND_CODE) {
            const gmcpData = data.substring(1);
            if (!gmcpData.length) return;
            const spaceIndex = gmcpData.indexOf(" ");
            if (spaceIndex === -1) return;
            const type = gmcpData.substring(0, spaceIndex).toLowerCase();
            const payload = gmcpData.substring(spaceIndex + 1);
            try {
                const gmcp = JSON.parse(payload);
                this.receivedFirstGmcp = this.receivedFirstGmcp || type === "char.info";
                if (type === "gmcp_msgs") {
                    let text = atob(gmcp.text);
                    text = text.replace(//g, "\\u001B");
                    this.messageBuffer.push({ text, type: gmcp.type });
                } else {
                    this.emit(`gmcp.${type}`, gmcp);
                    this.emit('gmcp', { path: type, value: gmcp });
                }
            } catch (error) {
                console.error('Error parsing GMCP JSON:', error);
            }
        }
    }

    flushMessageBuffer() {
        let processed: { text: string, type?: string }[] = [];
        this.messageBuffer.forEach((message) => {
            if (processed[processed.length - 1]?.type === message.type) {
                processed[processed.length - 1].text += message.text;
            } else {
                processed.push(message);
            }
        });
        processed.forEach((message, i) => {
            this.sendLine(message.text, message.type!, i);
        });
        this.emit('output-sent', processed.length);
        this.messageBuffer = [];
    }

    private sendLine(text: string, type: string, i: number) {
        text = window.clientExtension.onLine(text, type);
        eventBus.on('output-sent', () => this.emit(`gmcp_msg.${type}`, text), { once: true });
        // @ts-ignore
        Output.send(parseAnsiPatterns(text), type);
        this.emit('line-sent');
    }
}

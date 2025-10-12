import eventBus from "../../eventBus";
import type {
    TransportAdapter,
    TransportIn,
    TransportObservable,
    TransportSubscription,
} from "./types";

const GMCP_COMMAND_CODE = 201;
const TELNET_OPTION_REGEX = /\u00FF\u00FA.*?\u00FF\u00F0|\u00FF.[^\u00FF]/g;

export interface MessageRouterOptions {
    parseAnsiPatterns: (text: string) => string;
    transformLine?: (text: string, type: string) => string;
}

const defaultTransformLine = (text: string, type: string) => {
    const extension = (window as any).clientExtension;
    if (extension && typeof extension.onLine === "function") {
        return extension.onLine(text, type);
    }
    return text;
};

export default class MessageRouter {
    private subscription?: TransportSubscription;
    private messageBuffer: { text: string; type: string }[] = [];
    private receivedFirstGmcp = false;
    private readonly parseAnsiPatterns: (text: string) => string;
    private readonly transformLine: (text: string, type: string) => string;

    constructor(private transport: TransportAdapter, options: MessageRouterOptions) {
        this.parseAnsiPatterns = options.parseAnsiPatterns;
        this.transformLine = options.transformLine ?? defaultTransformLine;
        this.subscribe(transport.messages$);
    }

    private subscribe(observable: TransportObservable<TransportIn>) {
        this.subscription = observable.subscribe((message) => {
            if (message.type === "data") {
                this.processIncomingData(message.payload);
            }
        });
    }

    attach(transport: TransportAdapter) {
        this.dispose();
        this.transport = transport;
        this.subscribe(transport.messages$);
    }

    dispose() {
        this.subscription?.unsubscribe();
        this.subscription = undefined;
    }

    reset() {
        this.receivedFirstGmcp = false;
        this.messageBuffer = [];
    }

    get hasReceivedFirstGmcp() {
        return this.receivedFirstGmcp;
    }

    processFrame(data: string) {
        this.processIncomingData(data);
    }

    flushMessageBuffer() {
        if (!this.messageBuffer.length) {
            return;
        }

        const merged: { text: string; type: string }[] = [];
        for (const entry of this.messageBuffer) {
            const last = merged[merged.length - 1];
            if (last && last.type === entry.type) {
                last.text += entry.text;
            } else {
                merged.push({...entry});
            }
        }

        merged.forEach((message, index) => this.sendLine(message.text, message.type, index));
        eventBus.emit("output-sent", merged.length);
        this.messageBuffer = [];
    }

    private processIncomingData(data: string) {
        const withoutOptions = data.replace(TELNET_OPTION_REGEX, this.parseTelnetOption);
        const sanitized = withoutOptions.replace(/[ÿù]/g, "");
        if (sanitized.trim().length > 0) {
            eventBus.emit("message", sanitized);
        }
        this.flushMessageBuffer();
    }

    private parseTelnetOption = (optionData: string): string => {
        if (optionData.length >= 5) {
            this.parseTelnetSubnegotiation(optionData.substring(2, optionData.length - 2));
        }
        return "";
    };

    private parseTelnetSubnegotiation(data: string) {
        if (!data.length) {
            return;
        }

        const firstChar = data.charCodeAt(0);
        if (firstChar !== GMCP_COMMAND_CODE) {
            return;
        }

        const gmcpData = data.substring(1);
        if (!gmcpData.length) {
            return;
        }

        const spaceIndex = gmcpData.indexOf(" ");
        if (spaceIndex === -1) {
            return;
        }

        const type = gmcpData.substring(0, spaceIndex).toLowerCase();
        let payload = gmcpData.substring(spaceIndex + 1);

        if (type === "gmcp_msgs") {
            payload = payload.replace(/g/g, "\\u001B");
        }

        try {
            const parsed = JSON.parse(payload);
            if (type === "gmcp_msgs") {
                const text = atob(parsed.text);
                this.messageBuffer.push({ text, type: parsed.type });
                return;
            }

            if (type === "char.info") {
                this.receivedFirstGmcp = true;
            }

            eventBus.emit(`gmcp.${type}` as `gmcp.${string}`, parsed);
            eventBus.emit("gmcp", { path: type, value: parsed });
        } catch (error) {
            console.error("Error parsing GMCP JSON:", (error as Error).message);
        }
    }

    private sendLine(text: string, type: string, index: number) {
        const transformed = this.transformLine(text, type);
        eventBus.on("output-sent", () => {
            eventBus.emit(`gmcp_msg.${type}` as `gmcp_msg.${string}`, transformed);
        }, { once: true });

        if (typeof (window as any).Output?.send === "function") {
            (window as any).Output.send(this.parseAnsiPatterns(transformed), type);
        }
        eventBus.emit("line-sent");
    }
}

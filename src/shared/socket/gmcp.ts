import { GMCP_COMMAND_CODE, GMCP_IAC, GMCP_SB, GMCP_SE, TELNET_OPTION_REGEX } from "./constants";

export interface GmcpEnvelope {
    path: string;
    value: unknown;
}

export type TelnetOptionHandler = (data: string) => string;

export const createTelnetOptionParser = (onSubnegotiation: (data: string) => void): TelnetOptionHandler => {
    return (optionData: string) => {
        if (optionData.length === 3) {
            return "";
        }
        onSubnegotiation(optionData.substring(2, optionData.length - 2));
        return "";
    };
};

export const stripTelnetSequences = (data: string, handler: TelnetOptionHandler): string => {
    return data.replace(TELNET_OPTION_REGEX, handler).replace(/[ÿù]/g, "");
};

const parseGmcpPayload = (
    data: string,
    onMessage: (type: string, payload: unknown, isFirstCharInfo: boolean) => void,
    trackFirst?: { received: boolean },
): void => {
    if (data.length === 0) return;

    const firstChar = data.charCodeAt(0);
    if (firstChar !== GMCP_COMMAND_CODE) {
        return;
    }

    const gmcpData = data.substring(1);
    if (!gmcpData.length) return;

    const spaceIndex = gmcpData.indexOf(" ");
    if (spaceIndex === -1) return;

    const type = gmcpData.substring(0, spaceIndex).toLowerCase();
    let payload = gmcpData.substring(spaceIndex + 1);

    if (type === "gmcp_msgs") {
        payload = payload.replace(/\u001b/g, "\\u001B");
    }

    try {
        const gmcp = JSON.parse(payload);
        const isFirst = type === "char.info" && !trackFirst?.received;
        if (trackFirst) {
            trackFirst.received = trackFirst.received || type === "char.info";
        }
        onMessage(type, gmcp, isFirst);
    } catch (error) {
        console.error("Error parsing GMCP JSON:", error);
    }
};

export const encodeGmcp = (path: string, payload: unknown): string => {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
    return `${GMCP_IAC}${GMCP_SB}${String.fromCharCode(GMCP_COMMAND_CODE)}${path} ${data}${GMCP_IAC}${GMCP_SE}`;
};

export const createGmcpStream = ({
    onEnvelope,
    onMessage,
    onFirstCharInfo,
}: {
    onEnvelope: (payload: GmcpEnvelope) => void;
    onMessage: (text: string, type: string) => void;
    onFirstCharInfo?: () => void;
}) => {
    const state = { received: false };
    return (data: string) => {
        parseGmcpPayload(
            data,
            (type, payload, isFirst) => {
                if (type === "gmcp_msgs") {
                    const msgType = (payload as { type: string }).type ?? "";
                    const binaryString = atob((payload as { text: string }).text ?? "");
                    const text = msgType === "system.login"
                        ? new TextDecoder('utf-8').decode(Uint8Array.from(binaryString, c => c.charCodeAt(0)))
                        : binaryString;
                    onMessage(text, msgType);
                    return;
                }
                if (isFirst) {
                    onFirstCharInfo?.();
                }
                onEnvelope({ path: type, value: payload });
            },
            state,
        );
    };
};

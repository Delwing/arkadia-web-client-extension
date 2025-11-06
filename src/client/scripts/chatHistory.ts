import Client from "../Client";
import { AnsiAwareBuffer } from "../ansi/FormatState";

const HISTORY_LIMIT = 20;

type ChatEntry = {
    timestamp: string;
    buffer: AnsiAwareBuffer;
};

export default function initChatHistory(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const history: ChatEntry[] = [];

    function formatTimestamp(date: Date) {
        return date.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }

    function addEntry(buffer: AnsiAwareBuffer) {
        const entry: ChatEntry = {
            timestamp: formatTimestamp(new Date()),
            buffer: buffer.clone(),
        };
        history.push(entry);
        if (history.length > HISTORY_LIMIT) {
            history.shift();
        }
    }

    function printHistory() {
        if (!history.length) {
            client.print("Brak zapisanych wiadomosci czatu.");
            return;
        }
        const output = new AnsiAwareBuffer();
        history.forEach((entry, index) => {
            if (index > 0) {
                output.append("\n");
            }
            output.append(`[${entry.timestamp}] `);
            output.appendBuffer(entry.buffer);
        });
        client.print(output);
    }

    client.on("gmcp_msg.comm", (buffer) => {
        if (!(buffer instanceof AnsiAwareBuffer) || !buffer.text.trim()) return;
        addEntry(buffer);
    });

    client.on("client.disconnect", () => {
        history.length = 0;
    });

    if (aliases) {
        aliases.push({ pattern: /^\/chat$/, callback: printHistory });
    }
}

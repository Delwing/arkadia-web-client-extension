import Client from "../Client";
import appEventBus from "../events/app-event-bus";

const HISTORY_LIMIT = 20;

type ChatEntry = {
    timestamp: string;
    text: string;
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

    function addEntry(text: string) {
        const entry: ChatEntry = {
            timestamp: formatTimestamp(new Date()),
            text,
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
        const lines: string[] = [];
        history.forEach((entry) => {
            const messageLines = entry.text.split(/\r?\n/);
            messageLines.forEach((line) => {
                lines.push(`[${entry.timestamp}] ${line}`);
            });
        });
        client.print(lines.join("\n"));
    }

    appEventBus.on("gmcp_msg.comm", (event) => {
        const text = event
        if (typeof text !== "string" || !text.trim()) return;
        addEntry(text);
    });

    appEventBus.on("client.disconnect", () => {
        history.length = 0;
    });

    if (aliases) {
        aliases.push({ pattern: /^\/chat$/, callback: printHistory });
    }
}
